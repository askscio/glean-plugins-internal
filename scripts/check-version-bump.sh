#!/bin/bash
# CI check: verify the patch version was incremented when plugin files change.
# Compares the PR branch version against the base branch version.
# Version source of truth: plugins/glean/.claude-plugin/plugin.json
set -euo pipefail

BASE_REF="${1:-origin/master}"

PLUGIN_PATHS="^(src/|plugins/glean/|scripts/build\.mjs)"

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
  echo "Bump the patch version in plugins/glean/.claude-plugin/plugin.json"
  exit 1
fi

echo "Version bump verified: $BASE_VERSION → $PLUGIN_VERSION"
