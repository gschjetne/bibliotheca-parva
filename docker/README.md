# Containerised dev/agent environment

A sandbox for running Claude Code with `--dangerously-skip-permissions` against
this project (the Cloudflare Workers app at the repository root).

## Quick start

```sh
./docker/agent.sh
```

That builds the image, starts the `agent` container, copies your host Claude
login into it, and drops you into the agent shell. Then:

```sh
claude --dangerously-skip-permissions
```

## What's in the box

| Service | Purpose                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `agent` | Node 22 + Python 3.11 + Claude Code, running as non-root user `dev` (uid 1000) so `--dangerously-skip-permissions` is allowed. |

- **Run the app**: inside the agent, `npm run dev -- --host 0.0.0.0 --port 8000` →
  browse at <http://localhost:8055> (host port set by `WEB_HOST_PORT`).
- **Cloudflare docs MCP**: `cloudflare-docs` (`https://docs.mcp.cloudflare.com/mcp`),
  configured in `../.mcp.json`. Check with `claude mcp list`.

## Manual steps (what agent.sh automates)

```sh
docker compose up -d                              # start the agent
./docker/seed-auth.sh                             # copy host Claude login in
docker compose exec agent bash                    # shell in
```

## Auth

Credentials live in the `claude_home` named volume (via `CLAUDE_CONFIG_DIR`),
isolated from the host's `~/.claude`. `seed-auth.sh` streams your host OAuth
token in over stdin — nothing is written into the repo. Alternatively, run
`/login` inside the container once; the volume persists it.

## Environment notes

- The host port mapping is configurable in `../.env` (`WEB_HOST_PORT`, default
  8055 → container 8000, where `wrangler dev` serves).
- The host login is **not** bind-mounted: this host's Docker is snap-confined,
  which (a) expands `${HOME}` to the snap's private home and (b) is unreliable
  with top-level dotdirs. Streaming creds into a named volume sidesteps both.
