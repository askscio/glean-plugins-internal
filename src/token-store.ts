import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

const CREDENTIALS_FILENAME = "mcp-credentials.json";

function resolveCredentialsDir(): string {
  const pluginData = process.env.PLUGIN_DATA_DIR;
  if (pluginData) {
    return pluginData;
  }
  return path.join(homedir(), ".glean");
}

interface StoredCredentials {
  tokens?: unknown;
  clientInfo?: unknown;
}

export function loadCredentials(): StoredCredentials | undefined {
  try {
    const raw = fs.readFileSync(path.join(resolveCredentialsDir(), CREDENTIALS_FILENAME), "utf-8");
    return JSON.parse(raw) as StoredCredentials;
  } catch {
    return undefined;
  }
}

export function saveCredentials(tokens: unknown, clientInfo: unknown): void {
  try {
    const dir = resolveCredentialsDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const data: StoredCredentials = { tokens, clientInfo };
    fs.writeFileSync(path.join(dir, CREDENTIALS_FILENAME), JSON.stringify(data, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[auth] Failed to persist credentials: ${msg}`);
  }
}

export function clearCredentials(): void {
  try {
    fs.rmSync(path.join(resolveCredentialsDir(), CREDENTIALS_FILENAME), { force: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[auth] Failed to clear credentials: ${msg}`);
  }
}
