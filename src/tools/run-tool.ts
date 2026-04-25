import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { callRemoteTool } from "../remote-client.js";

const HITL_ENABLED = process.env.ENABLE_HITL === "true";

interface ToolMetadata {
  requires_approval?: boolean;
  name?: string;
  description?: string;
  server_id?: string;
}

async function findToolJson(
  skillsBaseDir: string,
  toolName: string,
): Promise<ToolMetadata | null> {
  try {
    const skillDirs = await fs.readdir(skillsBaseDir, { withFileTypes: true });
    for (const dir of skillDirs) {
      if (!dir.isDirectory()) continue;
      const toolPath = path.join(skillsBaseDir, dir.name, "tools", `${toolName}.json`);
      try {
        const content = await fs.readFile(toolPath, "utf-8");
        return JSON.parse(content) as ToolMetadata;
      } catch {
        continue;
      }
    }
  } catch {
    // Skills dir doesn't exist or can't be read
  }
  return null;
}

export async function handleRunTool(
  remoteClient: Client,
  mcpServer: Server,
  skillsBaseDir: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const serverId = args.server_id;
  const toolName = args.tool_name;

  if (typeof serverId !== "string" || typeof toolName !== "string") {
    return {
      content: [
        { type: "text", text: "server_id and tool_name are required strings" },
      ],
      isError: true,
    };
  }

  if (HITL_ENABLED && mcpServer.getClientCapabilities()?.elicitation) {
    const toolMeta = await findToolJson(skillsBaseDir, toolName);

    if (toolMeta?.requires_approval) {
      const message = [
        `**Action: ${toolName}**`,
        toolMeta.description ? `${toolMeta.description}` : "",
        `Server: ${serverId}`,
        "",
        "Accept to execute, or decline to cancel.",
      ]
        .filter(Boolean)
        .join("\n");

      try {
        const result = await mcpServer.elicitInput({
          message,
          requestedSchema: { type: "object", properties: {} } as any,
        });

        if (result.action !== "accept") {
          return {
            content: [
              {
                type: "text",
                text: `Action ${toolName} was ${result.action === "decline" ? "declined" : "cancelled"} by the user.`,
              },
            ],
          };
        }
      } catch {
        // Fall through to execute without approval on elicitation failure
      }
    }
  }

  const remoteArgs: Record<string, unknown> = {
    server_id: serverId,
    tool_name: toolName,
  };
  if (args.arguments != null) {
    remoteArgs.arguments = args.arguments;
  }
  return callRemoteTool(remoteClient, "run_tool", remoteArgs);
}
