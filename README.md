# Glean Claude + Cursor plugins

Glean's plugins for [Claude Code](https://code.claude.com/docs/en/overview),
[Claude Cowork](https://claude.com/cowork), and
[Cursor](https://docs.cursor.com/). This repo is a single-plugin marketplace
that targets all three hosts from one source of truth.

Today it ships one plugin:

- **`glean`** — adds two tools, `discover_skills` and `run_tool`, that let
  the agent discover Glean-hosted skills for enterprise apps (Jira, Slack,
  Google Workspace, Salesforce, etc.) and invoke their downstream tools via
  Glean's MCP gateway.

## Install

### Claude Code (terminal)

```
/plugin marketplace add askscio/glean-plugins-internal
/plugin install glean@glean-plugins-internal
```

### Claude Cowork (desktop)

1. Open the plugin picker.
2. Click **Add marketplace**, choose **GitHub**, and enter
   `askscio/glean-plugins-internal`.
3. Once the marketplace syncs, install the **glean** plugin from it.

### Cursor

Cursor reads the same repo — the `.cursor-plugin/` manifests live alongside
the Claude Code ones. In the Cursor IDE, use the plugin picker to add
`askscio/glean-plugins-internal` as a marketplace, then install `glean`.

See [Cursor's plugins docs](https://cursor.com/docs/plugins/building) for
the latest UI flow.

## First run

The first tool call triggers an OAuth sign-in to Glean. Two flows depending
on your client:

- **Claude Code / Cursor (elicitation-capable):** a form pops up in-place.
  Complete the browser sign-in, then pick "Signed in successfully" (or
  paste the callback URL if your browser couldn't reach 127.0.0.1:29107).
  The tool call finishes normally.
- **Cowork (no elicitation UI):** the tool call returns
  `[AUTHENTICATION_REQUIRED]` with a sign-in URL. Open it in your browser,
  complete sign-in, and when the browser shows "can't reach server" on the
  callback page, copy the URL from the address bar and retry the original
  tool call with a `callback_url` argument set to that URL. The server
  extracts the `code` and finishes sign-in in the same call.

After sign-in, the OAuth credentials are cached to `~/.glean/` and reused
across sessions — you won't be prompted again until the refresh token
expires.

## Updates

```
# Claude Code
/plugin marketplace update glean-plugins-internal

# Cowork / Cursor: the plugin picker has a "Sync" / "Check for updates"
# button on the marketplace entry.
```

## Testing a specific branch or PR

You can point the marketplace at a specific git branch, tag, or commit:

```bash
# Install from a specific branch (e.g. a PR branch)
/plugin marketplace add askscio/glean-plugins-internal@branch-name
/plugin install glean@glean-plugins-internal

# Or update an existing marketplace to a different branch
/plugin marketplace remove glean-plugins-internal
/plugin marketplace add askscio/glean-plugins-internal@branch-name
```

You can also pin to a branch in `settings.json`:

```json
{
  "marketplaces": [
    {
      "name": "glean-plugins-internal",
      "source": "https://github.com/askscio/glean-plugins-internal",
      "sourceType": "git",
      "branch": "mohit-baseline-marketplace-layout"
    }
  ]
}
```

For local development, point the marketplace at your local checkout instead:

```bash
/plugin marketplace add /path/to/glean-plugins-internal
```

Then just `git checkout` whichever branch you want to test.

## Troubleshooting

- **Sign-in loop** — the cached OAuth provider state may be stale. Delete
  `~/.glean/credentials.json` and retry.
- **`GLEAN_MCP_SERVER_URL is required`** — the plugin's `.mcp.json` /
  `mcp.json` wasn't picked up by the host. Reinstall; if that fails, open
  an issue.
- **Server logs** — every tool call writes to
  `$CLAUDE_PLUGIN_DATA/glean-server.log` (or `~/.glean/glean-server.log` if
  the host didn't set that env var). `tail -f` to see what's happening.

## Development

Prerequisites: Node 22+, npm.

```bash
npm install
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run build       # esbuild → plugins/glean/dist/index.js
npm run pack:plugin # produce glean-<version>.plugin sideload artifact
```

Source is at the repo root (`src/`, `tests/`, `scripts/`). Packaged
runtime lives under `plugins/glean/`. See the Layout section below.

## Release process

1. Bump `version` in `plugins/glean/.claude-plugin/plugin.json` **and**
   `plugins/glean/.cursor-plugin/plugin.json` **and**
   `plugins/glean/package.json` (keep all three in sync).
2. `npm test && npm run typecheck` — verify clean.
3. `npm run pack:plugin` — produces `glean-<version>.plugin`. Optional;
   marketplace-add users install straight from git and don't need the
   archive.
4. Commit, tag, and push:
   ```bash
   git tag v<version>
   git push && git push --tags
   ```
5. Draft a release on GitHub if you want to attach the `.plugin` file.

## Layout

```
.claude-plugin/
  marketplace.json        Top-level marketplace manifest for Claude Code
                          / Cowork. Points at ./plugins/glean as the
                          plugin source.
.cursor-plugin/
  marketplace.json        Same shape, Cursor's flavor. Points at the
                          same ./plugins/glean source.
plugins/glean/
  .claude-plugin/
    plugin.json           Plugin manifest — name, version, description
  .cursor-plugin/
    plugin.json           Cursor-flavor plugin manifest (mirrored)
  .mcp.json               MCP server invocation read by Claude Code /
                          Cowork. Source of truth.
  mcp.json -> .mcp.json   Symlink so Cursor finds the same config under
                          its expected filename.
  dist/index.js           Built server bundle (every dep inlined; produced
                          by `npm run build`; gitignored)
  skills/glean_run/       Skill that tells the agent how to use the
                          tools. Uses the open SKILL.md standard, read
                          identically by all three hosts.
  start.sh                Bash launcher that anchors PROJECT_DIR to the
                          host's spawn cwd, then execs node on the bundle
  package.json            Minimal "type": "module" manifest so Node
                          treats dist/index.js as ESM at runtime
  LICENSES-THIRD-PARTY.txt Attribution for inlined dependencies
src/                      TypeScript sources for the MCP server
tests/                    Vitest suite
scripts/                  build.mjs, pack-plugin.sh, build-licenses.mjs
package.json              Top-level dev config — deps, npm scripts
tsconfig.json             TypeScript config for the dev tree
```

## License

Apache 2.0. See [LICENSE](./LICENSE).
