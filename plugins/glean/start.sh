#!/bin/bash
# Invoked by the plugin host (Cowork or Claude Code) to launch the Glean MCP
# server. The plugin ships a single-file esbuild output at dist/index.js with
# every non-builtin inlined — no node_modules next to it. This script handles
# env sanitation and captures LAUNCH_CWD so we can anchor
# `git rev-parse --show-toplevel` to the host's spawn cwd rather than whatever
# cwd Node happens to inherit.
set -e
LAUNCH_CWD="$PWD"
PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"

# Guard against the Cowork `.mcp.json` env-block quirk: `${VAR}` can come
# through as a literal six-character string rather than being expanded.
# Treat a value starting with "${" the same as unset.
case "${CLAUDE_PLUGIN_DATA:-}" in
  '${'*) unset CLAUDE_PLUGIN_DATA ;;
esac

# Opt-in: resolve a PROJECT_DIR so the Node side can root its skills cache
# under the user's current project (preferred in Claude Code, where a stable
# project root exists). Always unset first so an inherited PROJECT_DIR from
# the parent shell can't leak through when the flag is off. Cowork does not
# set USE_CLAUDE_PROJECT_DIR, so PROJECT_DIR stays unset there and the Node
# side falls back to $PLUGIN_DATA_DIR for persistence.
unset PROJECT_DIR
if [ "${USE_CLAUDE_PROJECT_DIR:-}" = "1" ]; then
  PROJECT_DIR=$(git -C "$LAUNCH_CWD" rev-parse --show-toplevel 2>/dev/null || true)
  if [ -z "$PROJECT_DIR" ]; then
    PROJECT_DIR="$LAUNCH_CWD"
  fi
  export PROJECT_DIR
fi

# Forward the resolved data dir under a stable name the Node side can rely on.
# May be empty if the host didn't set CLAUDE_PLUGIN_DATA; the Node side
# falls back to ~/.glean in that case.
export PLUGIN_DATA_DIR="${CLAUDE_PLUGIN_DATA:-}"

exec node "$PLUGIN_DIR/dist/index.js"
