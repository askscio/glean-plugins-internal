#!/bin/bash
# Invoked by the plugin host (Cowork or Claude Code) to launch the Glean MCP
# server. The plugin ships a single-file esbuild output at dist/index.js with
# every non-builtin inlined — no node_modules next to it. This script handles
# env sanitation before launching the Node process.
set -e
PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"

# Guard against the Cowork `.mcp.json` env-block quirk: `${VAR}` can come
# through as a literal six-character string rather than being expanded.
# Treat a value starting with "${" the same as unset.
case "${CLAUDE_PLUGIN_DATA:-}" in
  '${'*) unset CLAUDE_PLUGIN_DATA ;;
esac

# Resolve where discovered skill files are written.
# CLAUDE_PLUGIN_DATA is the managed lifecycle dir provided by the plugin host.
if [ -n "${CLAUDE_PLUGIN_DATA:-}" ]; then
  export SKILLS_BASE_DIR="$CLAUDE_PLUGIN_DATA/glean-skills-cache"
else
  export SKILLS_BASE_DIR="${HOME:-/tmp}/.claude/tmp/glean-skills-cache"
fi

# Forward the resolved data dir under a stable name the Node side can rely on.
# May be empty if the host didn't set CLAUDE_PLUGIN_DATA; the Node side
# falls back to ~/.glean in that case.
export PLUGIN_DATA_DIR="${CLAUDE_PLUGIN_DATA:-}"

exec node "$PLUGIN_DIR/dist/index.js"
