# Dev/agent image for Bibliotheca Parva (the Cloudflare Workers app).
#
# Bundles Node 20 + Claude Code so it can run `claude
# --dangerously-skip-permissions` safely inside a container. Runs as a non-root
# user because Claude Code refuses --dangerously-skip-permissions as root.
# Python 3.11 (the base image) is kept for scripts/import_dump.py.
FROM python:3.11-slim-bookworm

# Match the host user so bind-mounted files (project, ~/.claude) keep their
# ownership and Claude Code's credential files stay readable/writable.
ARG UID=1000
ARG GID=1000
ARG USERNAME=dev

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NODE_MAJOR=20

# System deps: git, curl, ca-certificates + gnupg for tooling and the Node install.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
        gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI + the mcp-remote bridge (handy fallback for remote MCP servers).
RUN npm install -g @anthropic-ai/claude-code mcp-remote

# Create the non-root user matching the host UID/GID. Reuse an existing group
# if GID 1000 is already taken in the base image.
RUN if ! getent group "${GID}" >/dev/null; then groupadd --gid "${GID}" "${USERNAME}"; fi \
    && useradd --uid "${UID}" --gid "${GID}" --create-home --shell /bin/bash "${USERNAME}" \
    # Pre-create the Claude config dir owned by the user so the named volume
    # mounted here is initialised with the right ownership (named volumes
    # inherit ownership/content from the image path on first creation).
    && mkdir -p "/home/${USERNAME}/.claude" \
    && chown -R "${UID}:${GID}" "/home/${USERNAME}/.claude"

WORKDIR /workspace
USER ${UID}:${GID}

# Keep Claude's config under the mounted home; default to a friendly shell.
ENV HOME=/home/${USERNAME}
CMD ["sleep", "infinity"]
