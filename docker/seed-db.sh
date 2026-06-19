#!/usr/bin/env bash
# Restore db-backup.sql.bz2 into the Postgres service. Idempotent: drops and
# recreates the public schema first, so it can be re-run any time.
set -euo pipefail
cd "$(dirname "$0")/.."

export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"
HOST="${POSTGRES_HOST:-db}"
USER="${POSTGRES_USER:-postgres}"
DB="${POSTGRES_DB:-bibliotheca_parva}"
PSQL=(psql -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q)

BACKUP="db-backup.sql.bz2"
[ -f "$BACKUP" ] || { echo "ERROR: $BACKUP not found in $(pwd)" >&2; exit 1; }

echo ">> Resetting public schema in $DB@$HOST ..."
"${PSQL[@]}" -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'

echo ">> Restoring from $BACKUP ..."
bzcat "$BACKUP" | "${PSQL[@]}"

echo ">> Done. Row counts:"
"${PSQL[@]}" -c \
  "SELECT relname AS table, n_live_tup AS rows
     FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY relname;"
