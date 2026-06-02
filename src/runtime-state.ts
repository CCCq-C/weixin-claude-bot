import fs from "node:fs";
import path from "node:path";

export type RuntimeStatus = {
  wechatAccountLoaded?: boolean;
  whitelistConfigured?: boolean;
  vaultPath?: string;
  claudeCommand?: string;
  currentTask?: "idle" | "running";
  lastMessageAt?: string;
  lastError?: string;
};

type UnsafeStatus = RuntimeStatus & Record<string, unknown>;

const SENSITIVE_KEYS = new Set([
  "botToken",
  "bot_token",
  "token",
  "authorization",
  "Authorization",
  "apiKey",
  "api_key",
]);

function ensureDataDir(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
}

function sanitize<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

export function readStatus(dataDir = "data"): RuntimeStatus {
  const file = path.join(dataDir, "status.json");
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as RuntimeStatus;
  } catch {
    return {};
  }
}

export function updateStatus(dataDir: string, patch: UnsafeStatus): RuntimeStatus {
  ensureDataDir(dataDir);
  const next = {
    ...readStatus(dataDir),
    ...sanitize(patch),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(dataDir, "status.json"),
    JSON.stringify(next, null, 2),
    "utf-8",
  );
  return next;
}

export function appendEvent(
  dataDir: string,
  type: string,
  payload: Record<string, unknown> = {},
): void {
  ensureDataDir(dataDir);
  const event = {
    time: new Date().toISOString(),
    type,
    ...sanitize(payload),
  };
  fs.appendFileSync(path.join(dataDir, "events.log"), `${JSON.stringify(event)}\n`, "utf-8");
}
