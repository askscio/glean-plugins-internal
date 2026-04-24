import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

const GLEAN_DIR = path.join(homedir(), ".glean");
const CREDENTIALS_FILE = path.join(GLEAN_DIR, "mcp-credentials.json");

interface StoredCredentials {
  tokens?: unknown;
  clientInfo?: unknown;
}

export function loadCredentials(): StoredCredentials | undefined {
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(raw) as StoredCredentials;
  } catch {
    return undefined;
  }
}

export function saveCredentials(tokens: unknown, clientInfo: unknown): void {
  try {
    fs.mkdirSync(GLEAN_DIR, { recursive: true, mode: 0o700 });
    const data: StoredCredentials = { tokens, clientInfo };
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), {
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
    fs.rmSync(CREDENTIALS_FILE, { force: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[auth] Failed to clear credentials: ${msg}`);
  }
}
