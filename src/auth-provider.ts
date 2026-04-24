import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { execFile, spawn } from "node:child_process";
import { platform } from "node:os";
import { getCallbackUrl, waitForAuthCode } from "./auth-callback-server.js";
import { clearCredentials, loadCredentials, saveCredentials } from "./token-store.js";

export type InvalidationScope = "all" | "client" | "tokens" | "verifier";

export class GleanOAuthClientProvider implements OAuthClientProvider {
  private _clientInfo: OAuthClientInformationMixed | undefined;
  private _tokens: OAuthTokens | undefined;
  private _codeVerifier = "";
  private _pendingAuthCode: string | undefined;
  // True between issuing an authorize URL and either receiving tokens or
  // explicitly invalidating. Used to detect when a previous auth URL didn't
  // complete — likely because the server rejected the (stale) client_id.
  private _authUrlPending = false;

  authorizationUrl: string | undefined;

  constructor() {
    const stored = loadCredentials();
    if (stored) {
      this._tokens = stored.tokens as OAuthTokens | undefined;
      this._clientInfo = stored.clientInfo as OAuthClientInformationMixed | undefined;
    }
  }

  get redirectUrl(): string {
    return getCallbackUrl();
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [getCallbackUrl()],
      client_name: "Glean Claude Code Plugin",
    };
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this._clientInfo;
  }

  saveClientInformation(info: OAuthClientInformationMixed): void {
    this._clientInfo = info;
    saveCredentials(this._tokens, this._clientInfo);
  }

  tokens(): OAuthTokens | undefined {
    return this._tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this._tokens = tokens;
    this._authUrlPending = false;
    saveCredentials(this._tokens, this._clientInfo);
  }

  async invalidateCredentials(scope: InvalidationScope): Promise<void> {
    console.error(`[auth] Invalidating credentials: scope=${scope}`);
    switch (scope) {
      case "all":
        this._tokens = undefined;
        this._clientInfo = undefined;
        this._codeVerifier = "";
        this._authUrlPending = false;
        clearCredentials();
        break;
      case "client":
        this._clientInfo = undefined;
        saveCredentials(this._tokens, undefined);
        break;
      case "tokens":
        this._tokens = undefined;
        saveCredentials(undefined, this._clientInfo);
        break;
      case "verifier":
        this._codeVerifier = "";
        break;
    }
  }

  // True if we previously issued an authorize URL but never received tokens —
  // implying the URL was likely rejected by the server (e.g. stale client_id).
  needsFreshClient(): boolean {
    return (
      this._authUrlPending &&
      !this._tokens?.access_token &&
      this._pendingAuthCode === undefined
    );
  }

  get pendingAuthCode(): string | undefined {
    return this._pendingAuthCode;
  }

  clearPendingAuth(): void {
    this._pendingAuthCode = undefined;
    this.authorizationUrl = undefined;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.authorizationUrl = authorizationUrl.toString();
    this._authUrlPending = true;
    const expectedState = authorizationUrl.searchParams.get("state") ?? undefined;
    waitForAuthCode(expectedState).then(
      (code) => { this._pendingAuthCode = code; },
      () => { /* callback server error — will surface on next tool call */ },
    );
    if (platform() === "win32") {
      spawn("cmd", ["/c", "start", "", this.authorizationUrl], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } else {
      const cmd = platform() === "darwin" ? "open" : "xdg-open";
      execFile(cmd, [this.authorizationUrl]);
    }
  }

  saveCodeVerifier(codeVerifier: string): void {
    this._codeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    return this._codeVerifier;
  }

  async validateResourceURL(_serverUrl: string | URL, resource?: string): Promise<URL | undefined> {
    if (resource) {
      return new URL(resource);
    }
    return undefined;
  }
}
