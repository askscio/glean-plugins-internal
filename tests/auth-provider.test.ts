import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock homedir so token-store writes to a temp directory
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-provider-test-"));
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => tmpDir };
});

// Mock child_process to prevent browser launches
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

// Mock the callback server so redirectToAuthorization doesn't bind a real port
vi.mock("../src/auth-callback-server.js", () => ({
  getCallbackUrl: () => "http://127.0.0.1:29107/callback",
  waitForAuthCode: () => new Promise(() => {}) /*never resolves*/,
}));

const { GleanOAuthClientProvider } = await import("../src/auth-provider.js");

describe("GleanOAuthClientProvider", () => {
  const gleanDir = path.join(tmpDir, ".glean");

  beforeEach(() => {
    fs.rmSync(gleanDir, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(gleanDir, { recursive: true, force: true });
  });

  it("returns undefined tokens when no credentials file exists", () => {
    const provider = new GleanOAuthClientProvider();
    expect(provider.tokens()).toBeUndefined();
    expect(provider.clientInformation()).toBeUndefined();
  });

  it("loads persisted tokens on construction", () => {
    fs.mkdirSync(gleanDir, { recursive: true });
    fs.writeFileSync(
      path.join(gleanDir, "mcp-credentials.json"),
      JSON.stringify({
        tokens: { access_token: "saved_tok", token_type: "Bearer" },
        clientInfo: { client_id: "saved_cid" },
      }),
    );

    const provider = new GleanOAuthClientProvider();

    expect(provider.tokens()).toEqual({
      access_token: "saved_tok",
      token_type: "Bearer",
    });
    expect(provider.clientInformation()).toEqual({ client_id: "saved_cid" });
  });

  it("saveTokens persists to disk", () => {
    const provider = new GleanOAuthClientProvider();
    const tokens = { access_token: "new_tok", token_type: "Bearer" } as any;

    provider.saveTokens(tokens);

    expect(provider.tokens()).toEqual(tokens);
    const raw = JSON.parse(
      fs.readFileSync(path.join(gleanDir, "mcp-credentials.json"), "utf-8"),
    );
    expect(raw.tokens.access_token).toBe("new_tok");
  });

  it("saveClientInformation persists to disk", () => {
    const provider = new GleanOAuthClientProvider();
    const info = { client_id: "cid", client_secret: "sec" } as any;

    provider.saveClientInformation(info);

    expect(provider.clientInformation()).toEqual(info);
    const raw = JSON.parse(
      fs.readFileSync(path.join(gleanDir, "mcp-credentials.json"), "utf-8"),
    );
    expect(raw.clientInfo.client_id).toBe("cid");
  });

  it("clearPendingAuth resets auth state", () => {
    const provider = new GleanOAuthClientProvider();
    provider.authorizationUrl = "https://example.com/auth";

    provider.clearPendingAuth();

    expect(provider.pendingAuthCode).toBeUndefined();
    expect(provider.authorizationUrl).toBeUndefined();
  });

  it("saveCodeVerifier and codeVerifier round-trip", () => {
    const provider = new GleanOAuthClientProvider();

    provider.saveCodeVerifier("verifier_abc");

    expect(provider.codeVerifier()).toBe("verifier_abc");
  });

  it("redirectUrl returns loopback callback URL", () => {
    const provider = new GleanOAuthClientProvider();
    expect(provider.redirectUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  });

  it("clientMetadata includes redirect URI and client name", () => {
    const provider = new GleanOAuthClientProvider();
    const meta = provider.clientMetadata;

    expect(meta.client_name).toBe("Glean Claude Code Plugin");
    expect(meta.redirect_uris).toHaveLength(1);
    expect(meta.redirect_uris![0]).toMatch(/127\.0\.0\.1/);
  });

  it("invalidateCredentials('all') clears all in-memory state and deletes file", async () => {
    const provider = new GleanOAuthClientProvider();
    provider.saveTokens({ access_token: "tok", token_type: "Bearer" } as any);
    provider.saveClientInformation({ client_id: "cid" } as any);
    provider.saveCodeVerifier("verifier");
    await provider.redirectToAuthorization(new URL("https://example.com/oauth/authorize?state=s1"));
    expect(fs.existsSync(path.join(gleanDir, "mcp-credentials.json"))).toBe(true);

    await provider.invalidateCredentials("all");

    expect(provider.tokens()).toBeUndefined();
    expect(provider.clientInformation()).toBeUndefined();
    expect(provider.codeVerifier()).toBe("");
    expect(provider.needsFreshClient()).toBe(false);
    expect(fs.existsSync(path.join(gleanDir, "mcp-credentials.json"))).toBe(false);
  });

  it("invalidateCredentials('client') drops client but keeps tokens", async () => {
    const provider = new GleanOAuthClientProvider();
    provider.saveTokens({ access_token: "tok" } as any);
    provider.saveClientInformation({ client_id: "cid" } as any);

    await provider.invalidateCredentials("client");

    expect(provider.tokens()).toEqual({ access_token: "tok" });
    expect(provider.clientInformation()).toBeUndefined();
  });

  it("invalidateCredentials('tokens') drops tokens but keeps client", async () => {
    const provider = new GleanOAuthClientProvider();
    provider.saveTokens({ access_token: "tok" } as any);
    provider.saveClientInformation({ client_id: "cid" } as any);

    await provider.invalidateCredentials("tokens");

    expect(provider.tokens()).toBeUndefined();
    expect(provider.clientInformation()).toEqual({ client_id: "cid" });
  });

  it("invalidateCredentials('verifier') resets codeVerifier only", async () => {
    const provider = new GleanOAuthClientProvider();
    provider.saveTokens({ access_token: "tok" } as any);
    provider.saveCodeVerifier("verifier");

    await provider.invalidateCredentials("verifier");

    expect(provider.codeVerifier()).toBe("");
    expect(provider.tokens()).toEqual({ access_token: "tok" });
  });

  it("needsFreshClient is false initially", () => {
    const provider = new GleanOAuthClientProvider();
    expect(provider.needsFreshClient()).toBe(false);
  });

  it("needsFreshClient becomes true after issuing an authorize URL without tokens", async () => {
    const provider = new GleanOAuthClientProvider();
    provider.saveClientInformation({ client_id: "cid" } as any);

    await provider.redirectToAuthorization(new URL("https://example.com/oauth/authorize?state=s1"));

    expect(provider.needsFreshClient()).toBe(true);
  });

  it("needsFreshClient is false once tokens are saved", async () => {
    const provider = new GleanOAuthClientProvider();
    await provider.redirectToAuthorization(new URL("https://example.com/oauth/authorize?state=s1"));
    expect(provider.needsFreshClient()).toBe(true);

    provider.saveTokens({ access_token: "tok" } as any);

    expect(provider.needsFreshClient()).toBe(false);
  });

  it("needsFreshClient is false while a pendingAuthCode is waiting to be exchanged", async () => {
    const provider = new GleanOAuthClientProvider();
    await provider.redirectToAuthorization(new URL("https://example.com/oauth/authorize?state=s1"));
    (provider as unknown as { _pendingAuthCode: string })._pendingAuthCode = "code_xyz";

    expect(provider.needsFreshClient()).toBe(false);
  });

  it("needsFreshClient resets to false after invalidateCredentials('all')", async () => {
    const provider = new GleanOAuthClientProvider();
    await provider.redirectToAuthorization(new URL("https://example.com/oauth/authorize?state=s1"));
    expect(provider.needsFreshClient()).toBe(true);

    await provider.invalidateCredentials("all");

    expect(provider.needsFreshClient()).toBe(false);
  });
});
