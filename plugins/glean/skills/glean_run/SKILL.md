---
name: glean_run
description: Discover and run Glean skills for enterprise app tasks
argument-hint: <task description>
allowed-tools:
  - Read(path="**/glean-skills-cache/**")
---

# Glean Run

Discover and use Glean skills to help with enterprise app tasks (Jira, Slack,
Google Workspace, Salesforce, etc.) or actions you don't already have a tool for.
Where possible, aim to complete the user's request end-to-end rather than just
listing available skills.

## Session Context

Your current session ID is: ${CLAUDE_SESSION_ID}

## Authentication

When `discover_skills` or `run_tool` returns a response containing
`[AUTHENTICATION_REQUIRED]`, the user needs to complete sign-in in their browser.
A browser window will open automatically and the response includes a sign-in URL.

When this happens:
1. Tell the user that authentication is needed and share the sign-in URL from
   the response.
2. **Stop and wait.** Do not retry the tool call, do not try alternative
   approaches, and do not proceed with other steps.
3. Wait for the user to confirm they have completed sign-in (e.g. "done",
   "authenticated", "signed in").
4. Only then retry the same tool call.

Do not treat this as an error or attempt to work around it.

## Step 1: Discover Skills

If no arguments were provided and the task can't be inferred from conversation
context, ask the user what they'd like to do before proceeding.

Call `discover_skills` with the task description. Always include `session_id`.

```
discover_skills({
  query: "<task description>",
  session_id: "${CLAUDE_SESSION_ID}"
})
```

The response is an XML index of discovered skills with file paths.

You can call `discover_skills` multiple times — e.g. to discover skills for
individual sub-tasks as you work through a broad request.

## Step 2: Read Skill Instructions

Browse the returned skills and select the one most relevant to the user's
request. Read its `SKILL.md` file for detailed instructions. Skills typically
contain guidance on how to use their tools, but the tools can also be called
as independent units.

## Step 3: Read Tool Schemas

Read each tool's JSON file (e.g. `tools/TOOL_NAME.json`) to get the exact
`server_id`, `name`, and `inputSchema` with parameter names and types.

**Never guess parameter names** - always read the tool JSON file first.

## Step 4: Execute Tools

Call `run_tool` with the `server_id`, `tool_name` (from the `name` field in the
JSON), and `arguments` matching the `inputSchema` exactly.

```
run_tool({
  server_id: "composio/jira-pack",
  tool_name: "jirasearch",
  arguments: { query: "project = PROJ AND status = Open" }
})
```

## Rules

- Always pass `session_id: "${CLAUDE_SESSION_ID}"` when calling `discover_skills`
- Always read tool JSON files before calling `run_tool` - never guess parameters
- Break broad requests into atomic sub-tasks for better skill matching
- If discovery returns no relevant skills, tell the user what was searched
