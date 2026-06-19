#!/usr/bin/env bash
# Copy the host's Claude Code OAuth credentials into the agent container's
# config volume, so `claude` is already logged in inside the container.
#
# The token is streamed over `docker compose exec` stdin -- it never gets
# written into the repo tree, and we avoid bind-mounting the host's ~/.claude
# (snap-confined Docker can't reliably mount top-level dotdirs, and we don't
# want the container rewriting the host's live config).
#
# If you'd rather not share the host login, skip this and just run `/login`
# inside the container once; the named volume persists it.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${HOME}/.claude/.credentials.json"
if [ ! -f "$SRC" ]; then
  echo "No host credentials at $SRC."
  echo "Run 'claude' inside the container and use /login instead."
  exit 0
fi

docker compose exec -T agent mkdir -p /home/dev/.claude
docker compose exec -T agent sh -c 'umask 077; cat > /home/dev/.claude/.credentials.json' < "$SRC"
echo ">> Seeded Claude Code credentials into the agent container."
