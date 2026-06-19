# Containerised dev/agent environment

A sandbox for running Claude Code with `--dangerously-skip-permissions` against
this project, plus the full Django + Postgres stack. Built for the migration to
Cloudflare serverless.

## Quick start

```sh
./docker/agent.sh
```

That builds the image, starts `db` + `agent`, seeds the database from
`db-backup.sql.bz2`, copies your host Claude login into the container, and drops
you into the agent shell. Then:

```sh
claude --dangerously-skip-permissions
```

## What's in the box

| Service | Purpose |
|---------|---------|
| `db`    | PostgreSQL 16, data in the `pgdata` volume. Seeded from `db-backup.sql.bz2`. Not published to the host by default (reachable internally as host `db`). |
| `agent` | Python 3.11 + Node 20 + `psql` + Claude Code, running as non-root user `dev` (uid 1000) so `--dangerously-skip-permissions` is allowed. |

- **Django**: inside the agent, `python manage.py runserver 0.0.0.0:8000` →
  browse at <http://localhost:8055> (host port set by `WEB_HOST_PORT`).
- **Cloudflare docs MCP**: `cloudflare-docs` (`https://docs.mcp.cloudflare.com/mcp`),
  configured in `../.mcp.json` and pre-approved in `../.claude/settings.local.json`.
  Check with `claude mcp list`.

## Manual steps (what agent.sh automates)

```sh
docker compose up -d                              # start db + agent
docker compose exec agent ./docker/seed-db.sh     # restore the DB (idempotent)
./docker/seed-auth.sh                             # copy host Claude login in
docker compose exec agent bash                    # shell in
```

## Auth

Credentials live in the `claude_home` named volume (via `CLAUDE_CONFIG_DIR`),
isolated from the host's `~/.claude`. `seed-auth.sh` streams your host OAuth
token in over stdin — nothing is written into the repo. Alternatively, run
`/login` inside the container once; the volume persists it.

## Environment notes

- Host port mappings are configurable in `../.env` (`WEB_HOST_PORT`, and the
  commented-out `DB_HOST_PORT`) because 5432/8000 are already taken on the host.
- The host login is **not** bind-mounted: this host's Docker is snap-confined,
  which (a) expands `${HOME}` to the snap's private home and (b) is unreliable
  with top-level dotdirs. Streaming creds into a named volume sidesteps both.
