#!/bin/bash
# CI check: verify the version was incremented when plugin files change.
# Compares the PR branch version against the base branch version.
# Rejects downgrades. Version source of truth: plugins/glean/.claude-plugin/plugin.json
set -euo pipefail

BASE_REF="${1:-origin/master}"

# Only trigger on files that affect the plugin runtime — not CI, version
# bumps, or tooling scripts.
PLUGIN_PATHS="^(src/|plugins/glean/(dist/|skills/|start\.sh|\.mcp\.json|package\.json)|scripts/build\.mjs)"

if ! git diff --name-only "$BASE_REF"...HEAD | grep -qE "$PLUGIN_PATHS"; then
  echo "No plugin files changed — skipping version check."
  exit 0
fi

PLUGIN_VERSION=$(node -p "require('./plugins/glean/.claude-plugin/plugin.json').version")
BASE_VERSION=$(git show "$BASE_REF":plugins/glean/.claude-plugin/plugin.json | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')).version")

if [ "$PLUGIN_VERSION" = "$BASE_VERSION" ]; then
  echo "ERROR: Plugin files changed but version was not bumped."
  echo "  Base version:    $BASE_VERSION"
  echo "  Current version: $PLUGIN_VERSION"
  echo ""
  echo "Bump the version in plugins/glean/.claude-plugin/plugin.json"
  exit 1
fi

# Reject downgrades: current version must be greater than base.
HIGHER=$(node -p "
  const a = '$BASE_VERSION'.split('.').map(Number);
  const b = '$PLUGIN_VERSION'.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (b[i] > a[i]) { console.log = () => {}; process.exit(); }
    if (b[i] < a[i]) { console.log = () => {}; process.exit(1); }
  }
" 2>&1 && echo "ok" || echo "downgrade")

if [ "$HIGHER" = "downgrade" ]; then
  echo "ERROR: Version was downgraded."
  echo "  Base version:    $BASE_VERSION"
  echo "  Current version: $PLUGIN_VERSION"
  echo ""
  echo "The version must be higher than the base branch."
  exit 1
fi

echo "Version bump verified: $BASE_VERSION → $PLUGIN_VERSION"
