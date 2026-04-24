import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { GleanOAuthClientProvider } from "./auth-provider.js";

function loggingFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const method = init?.method ?? "GET";
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  console.error(`[fetch] ${method} ${url}`);
  return fetch(input, init).then(
    (response) => {
      console.error(
        `[fetch] ${method} ${url} → ${response.status} ${response.statusText}`,
      );
      return response;
    },
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      const cause =
        err instanceof Error && err.cause instanceof Error
          ? err.cause.message
          : String(err?.cause ?? "");
      console.error(`[fetch] ${method} ${url} → NETWORK ERROR: ${msg}`);
      if (cause) {
        console.error(`[fetch]   cause: ${cause}`);
      }
      throw err;
    },
  );
}

export interface RemoteClientOptions {
  apiToken?: string;
  authProvider?: GleanOAuthClientProvider;
}

export class AuthRequiredError extends Error {
  constructor(public readonly authUrl: string) {
    super("Authentication required");
  }
}

let pendingTransport: StreamableHTTPClientTransport | undefined;

export async function createRemoteClient(
  serverUrl: string,
  opts: RemoteClientOptions,
): Promise<Client> {
  const authProvider = opts.authProvider;

  // Complete a pending auth flow if the user has authenticated in the browser
  if (authProvider?.pendingAuthCode && pendingTransport) {
    console.error("[auth] Auth code received, exchanging for tokens...");
    try {
      await pendingTransport.finishAuth(authProvider.pendingAuthCode);
      authProvider.clearPendingAuth();
      pendingTransport = undefined;
      console.error("[auth] Token exchange complete, reconnecting...");
      return createRemoteClient(serverUrl, opts);
    } catch (err) {
      // Code exchange failed — most commonly because the client was
      // revoked server-side between sign-in and this call, so the code
      // belongs to a client that no longer exists. Discard the stale code
      // and fully invalidate so the next iteration re-registers from
      // scratch and issues a brand-new authorize URL.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[auth] Code exchange failed: ${msg} — discarding stale auth state`);
      authProvider.clearPendingAuth();
      pendingTransport = undefined;
      await authProvider.invalidateCredentials("all");
      return createRemoteClient(serverUrl, opts);
    }
  }

  // We previously issued an authorize URL but never received tokens. The URL
  // was likely rejected by the server (most commonly: the cached DCR client
  // was deleted server-side, e.g. user revoked the app). Force a fresh DCR so
  // the next URL we generate uses a valid, server-known client_id.
  if (authProvider?.needsFreshClient()) {
    console.error("[auth] Previous auth URL didn't complete — forcing fresh DCR");
    await authProvider.invalidateCredentials("all");
  }

  const client = new Client(
    { name: "glean", version: "1.0.0" },
    { capabilities: {} },
  );

  const parsedUrl = new URL(serverUrl);
  const headers: Record<string, string> = {
    "X-Glean-Internal-Service": "true",
    // Precommit.IfChange
    "X-Glean-Gateway-Request-Metadata": "IhwSDEdMRUFOX1BMVUdJThoMR0xFQU5fUExVR0lO",
    // Precommit.ThenChange(/go/core/mcp/server/proxy_tools_provider_test.go)
  };

  // The MCP handler reads SC params from this header, not from URL query params.
  const scParam = parsedUrl.searchParams.get("sc");
  if (scParam) {
    headers["X-Glean-Request-ScParams"] = scParam;
  }

  const transportOpts: ConstructorParameters<typeof StreamableHTTPClientTransport>[1] = {
    requestInit: { headers },
    fetch: loggingFetch,
  };

  if (opts.apiToken) {
    headers["Authorization"] = `Bearer ${opts.apiToken}`;
  } else if (opts.authProvider) {
    transportOpts.authProvider = opts.authProvider;
  }

  const transport = new StreamableHTTPClientTransport(
    new URL(serverUrl),
    transportOpts,
  );

  try {
    await client.connect(transport);
  } catch (error) {
    if (error instanceof UnauthorizedError && authProvider?.authorizationUrl) {
      pendingTransport = transport;
      throw new AuthRequiredError(authProvider.authorizationUrl);
    }
    throw error;
  }

  return client;
}

export async function callRemoteTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const result = await client.callTool({ name, arguments: args });
  if (!("content" in result)) {
    return { content: [] };
  }
  return result as CallToolResult;
}
