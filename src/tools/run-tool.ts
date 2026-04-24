import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { callRemoteTool } from "../remote-client.js";

export async function handleRunTool(
  remoteClient: Client,
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

  const remoteArgs: Record<string, unknown> = {
    server_id: serverId,
    tool_name: toolName,
  };
  if (args.arguments != null) {
    remoteArgs.arguments = args.arguments;
  }

  return callRemoteTool(remoteClient, "run_tool", remoteArgs);
}
