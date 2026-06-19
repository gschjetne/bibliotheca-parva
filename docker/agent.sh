#!/usr/bin/env bash
# One-shot bootstrap: build the image, start the agent, then drop you into the
# agent shell where you can run:
#   claude --dangerously-skip-permissions
set -euo pipefail
cd "$(dirname "$0")/.."

# Match the container user to the host user so bind mounts stay writable.
# (UID/GID are readonly in bash, so we pass them via .env, which compose reads.)
{
  echo "UID=$(id -u)"
  echo "GID=$(id -g)"
} > .env.uid
# Merge into .env without clobbering other vars the user may have set.
touch .env
grep -vE '^(UID|GID)=' .env > .env.tmp || true
cat .env.tmp .env.uid > .env
rm -f .env.tmp .env.uid

echo ">> Building image ..."
docker compose build

echo ">> Starting services ..."
docker compose up -d

echo ">> Seeding Claude Code credentials ..."
./docker/seed-auth.sh

echo
echo ">> Stack is up:"
echo "     App  : inside the agent -> (cd worker && npm run dev)  (http://localhost:${WEB_HOST_PORT:-8055})"
echo "     MCP  : cloudflare-docs (https://docs.mcp.cloudflare.com/mcp) via .mcp.json"
echo
echo ">> Entering agent shell. Start Claude with:"
echo "     claude --dangerously-skip-permissions"
echo
exec docker compose exec agent bash
