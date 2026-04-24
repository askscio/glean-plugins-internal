#!/bin/bash
# CI check: verify the patch version was incremented when plugin files change.
# Compares the PR branch version against the base branch version.
# Also verifies all version fields are in sync.
set -euo pipefail

BASE_REF="${1:-origin/master}"

# Files that require a version bump when changed.
PLUGIN_PATHS="^(src/|plugins/glean/|scripts/build\.mjs)"

if ! git diff --name-only "$BASE_REF"...HEAD | grep -qE "$PLUGIN_PATHS"; then
  echo "No plugin files changed — skipping version check."
  exit 0
fi

# Read versions from PR branch.
PLUGIN_VERSION=$(node -p "require('./plugins/glean/.claude-plugin/plugin.json').version")
PKG_VERSION=$(node -p "require('./plugins/glean/package.json').version")
ROOT_VERSION=$(node -p "require('./package.json').version")

# Check all three are in sync.
if [ "$PLUGIN_VERSION" != "$PKG_VERSION" ] || [ "$PLUGIN_VERSION" != "$ROOT_VERSION" ]; then
  echo "ERROR: Version mismatch across files:"
  echo "  plugins/glean/.claude-plugin/plugin.json: $PLUGIN_VERSION"
  echo "  plugins/glean/package.json:               $PKG_VERSION"
  echo "  package.json:                              $ROOT_VERSION"
  echo ""
  echo "All three must match. Update them and commit."
  exit 1
fi

# Read base branch version.
BASE_VERSION=$(git show "$BASE_REF":plugins/glean/.claude-plugin/plugin.json | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')).version")

if [ "$PLUGIN_VERSION" = "$BASE_VERSION" ]; then
  echo "ERROR: Plugin files changed but version was not bumped."
  echo "  Base version:    $BASE_VERSION"
  echo "  Current version: $PLUGIN_VERSION"
  echo ""
  echo "Bump the patch version in all three files:"
  echo "  plugins/glean/.claude-plugin/plugin.json"
  echo "  plugins/glean/package.json"
  echo "  package.json"
  exit 1
fi

echo "Version bump verified: $BASE_VERSION → $PLUGIN_VERSION"
