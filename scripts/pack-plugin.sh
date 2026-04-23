#!/bin/bash
# Produce a .plugin bundle from the repo. The output is named
# glean-<version>.plugin, with <version> read from the plugin's plugin.json.
# The resulting bundle is consumable by Claude Code, Cowork, and Cursor —
# no host-specific packaging (Cursor reads mcp.json, which is a symlink to
# .mcp.json, and its own .cursor-plugin/plugin.json sits alongside the
# Claude-Code manifest).
#
# As of 0.5.1 the bundle is a single-file esbuild output in dist/index.js.
# Cowork's install-time zip validator rejects archive paths that contain `@`
# (the scoped-package marker in `node_modules/@scope/pkg/...`), so we can't
# ship `node_modules/` — every dep gets inlined into dist/index.js instead.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$ROOT/plugins/glean"

VERSION="$(node -p "require('$PLUGIN_DIR/.claude-plugin/plugin.json').version")"
OUT="$ROOT/glean-${VERSION}.plugin"

cd "$ROOT"

# Fresh build — emits a single-file plugins/glean/dist/index.js with every
# non-builtin inlined and an inline source map. See scripts/build.mjs.
rm -rf "$PLUGIN_DIR/dist"
npm run build --silent

# Regenerate the third-party license manifest so it reflects what's
# actually in this build's lockfile. Silenced because license-checker
# chatters on stderr even when it succeeds.
npx --yes license-checker-rseidelsohn \
  --production --json --excludePrivatePackages \
  > /tmp/glean-licenses.json 2>/dev/null
node scripts/build-licenses.mjs /tmp/glean-licenses.json "$PLUGIN_DIR/LICENSES-THIRD-PARTY.txt"

# Remove any stale .plugin bundles (old versions or half-written files).
rm -f glean-*.plugin

# Ship only what's needed at runtime. Zip runs from inside plugins/glean/
# so archive paths are plugin-relative (host expects plugin.json at root
# of archive, not at plugins/glean/.claude-plugin/plugin.json).
#
#   .claude-plugin/      — Claude Code / Cowork read plugin.json here
#   .cursor-plugin/      — Cursor reads plugin.json here
#   .mcp.json            — Claude Code / Cowork MCP server invocation
#   mcp.json             — Cursor MCP server invocation (symlink to .mcp.json;
#                          zip follows symlinks by default so the archive
#                          contains two identical copies — fine at runtime)
#   dist/index.js        — bundled server (every non-builtin inlined)
#   skills/              — the glean_run skill instructions (same format
#                          for both hosts per the open SKILL.md standard)
#   start.sh             — bash wrapper that anchors PROJECT_DIR resolution
#                          to LAUNCH_CWD; .mcp.json and mcp.json invoke this
#   package.json         — declares "type": "module" so Node loads
#                          dist/index.js as ESM
#   LICENSES-THIRD-PARTY.txt — attribution for inlined deps
#
# We exclude marketplace.json from the bundle: those live at the repo root
# (both .claude-plugin/ and .cursor-plugin/ flavors) and are only read by
# hosts doing a repo-as-marketplace install. The standalone .plugin bundle
# is a single-plugin artifact; shipping marketplace.json could confuse
# hosts into thinking it's a marketplace.
cd "$PLUGIN_DIR"
zip -r "$OUT" \
  .claude-plugin \
  .cursor-plugin \
  .mcp.json \
  mcp.json \
  dist \
  skills \
  start.sh \
  package.json \
  LICENSES-THIRD-PARTY.txt \
  >/dev/null

echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
