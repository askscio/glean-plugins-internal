import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from "node:path";
import { AuthRequiredError, createRemoteClient, type RemoteClientOptions } from "./remote-client.js";
import { GleanOAuthClientProvider } from "./auth-provider.js";
import { handleDiscoverSkills } from "./tools/discover-skills.js";
import { handleRunTool } from "./tools/run-tool.js";

const GLEAN_MCP_SERVER_URL = process.env.GLEAN_MCP_SERVER_URL;
const GLEAN_API_TOKEN = process.env.GLEAN_API_TOKEN ?? "";

if (!GLEAN_MCP_SERVER_URL) {
  console.error("GLEAN_MCP_SERVER_URL environment variable is required");
  process.exit(1);
}

function resolveSkillsBaseDir(): string {
  if (process.env.SKILLS_BASE_DIR) {
    return process.env.SKILLS_BASE_DIR;
  }
  return path.join("/tmp", "glean-skills-cache");
}

const remoteClientOpts: RemoteClientOptions = GLEAN_API_TOKEN.length > 0
  ? { apiToken: GLEAN_API_TOKEN }
  : { authProvider: new GleanOAuthClientProvider() };

const server = new Server(
  { name: "glean", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "discover_skills",
      description:
        "Discover available Glean skills and their resolved tool dependencies. " +
        "Call this tool FIRST whenever the user's request cannot be fulfilled by your " +
        "current tools — especially for tasks involving enterprise apps (Jira, Slack, " +
        "Google Workspace, Salesforce, etc.) or any action you don't already have a " +
        "tool for. Before calling, break the user's request into specific, actionable " +
        "sub-tasks and pass each as a separate entry in the 'queries' array. " +
        "Discovered skills are written to local files and an XML skill " +
        "index with usage instructions is returned.",
      inputSchema: {
        type: "object" as const,
        properties: {
          queries: {
            type: "array",
            items: { type: "string" },
            description:
              "Atomic sub-task descriptions broken down from the user's request. " +
              "Each query should describe one specific action (e.g., 'search emails', " +
              "'create calendar event').",
          },
        },
        required: ["queries"],
      },
    },
    {
      name: "run_tool",
      description:
        "Execute a tool on a downstream MCP server. Before calling this tool, " +
        "you MUST read the tool's JSON file from the discover_skills output to get " +
        "the exact server_id, tool_name, and input_schema. Pass arguments that match " +
        "the input_schema exactly — do not guess parameter names.",
      inputSchema: {
        type: "object" as const,
        properties: {
          server_id: {
            type: "string",
            description: "The ID of the downstream MCP server.",
          },
          tool_name: {
            type: "string",
            description: "The name of the tool to invoke.",
          },
          arguments: {
            type: "object",
            description: "Optional arguments to pass to the downstream tool.",
          },
        },
        required: ["server_id", "tool_name"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  switch (name) {
    case "discover_skills": {
      const skillsBaseDir = resolveSkillsBaseDir();

      let remoteClient;
      try {
        remoteClient = await createRemoteClient(
          GLEAN_MCP_SERVER_URL!,
          remoteClientOpts,
        );
      } catch (err) {
        if (err instanceof AuthRequiredError) {
          return {
            content: [
              {
                type: "text",
                text: `[AUTHENTICATION_REQUIRED]\n\nThe user must sign in. A browser window has been opened and the sign-in URL is:\n${err.authUrl}\n\nTell the user authentication is needed and share the URL above. Then stop and wait for the user to confirm they have signed in before retrying.`,
              },
            ],
          };
        }
        const msg =
          err instanceof Error ? err.message : String(err);
        console.error(`discover_skills: failed to connect to backend: ${msg}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to connect to Glean backend: ${msg}`,
            },
          ],
          isError: true,
        };
      }
      try {
        const text = await handleDiscoverSkills(
          remoteClient,
          skillsBaseDir,
          args,
        );
        return { content: [{ type: "text", text }] };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : String(err);
        console.error(`discover_skills: execution failed: ${msg}`);
        return {
          content: [
            { type: "text", text: `discover_skills failed: ${msg}` },
          ],
          isError: true,
        };
      } finally {
        await remoteClient.close();
      }
    }

    case "run_tool": {
      let remoteClient;
      try {
        remoteClient = await createRemoteClient(
          GLEAN_MCP_SERVER_URL!,
          remoteClientOpts,
        );
      } catch (err) {
        if (err instanceof AuthRequiredError) {
          return {
            content: [
              {
                type: "text",
                text: `[AUTHENTICATION_REQUIRED]\n\nThe user must sign in. A browser window has been opened and the sign-in URL is:\n${err.authUrl}\n\nTell the user authentication is needed and share the URL above. Then stop and wait for the user to confirm they have signed in before retrying.`,
              },
            ],
          };
        }
        const msg =
          err instanceof Error ? err.message : String(err);
        console.error(`run_tool: failed to connect to backend: ${msg}`);
        return {
          content: [
            {
              type: "text",
              text: `Failed to connect to Glean backend: ${msg}`,
            },
          ],
          isError: true,
        };
      }
      try {
        return await handleRunTool(remoteClient, args);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : String(err);
        console.error(`run_tool: execution failed: ${msg}`);
        return {
          content: [
            { type: "text", text: `run_tool failed: ${msg}` },
          ],
          isError: true,
        };
      } finally {
        await remoteClient.close();
      }
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
