import path from "node:path";
import type { SpawnOptions } from "node:child_process";

type Platform = NodeJS.Platform;

export function getClaudeCommand(env: NodeJS.ProcessEnv = process.env): string {
  return (env.CLAUDE_COMMAND ?? "claude").trim() || "claude";
}

function isAbsolutePath(input: string): boolean {
  return path.isAbsolute(input) || path.win32.isAbsolute(input);
}

function isWholeHomeDirectory(input: string): boolean {
  const normalized = input.replace(/\\/g, "/").replace(/\/+$/, "");
  return (
    /^\/Users\/[^/]+$/i.test(normalized) ||
    /^\/home\/[^/]+$/i.test(normalized) ||
    /^[A-Z]:\/Users\/[^/]+$/i.test(normalized)
  );
}

export function validateVaultPath(vaultPath: string): void {
  const trimmed = vaultPath.trim();
  if (!trimmed) {
    throw new Error("VAULT_PATH 未配置，请复制 .env.example 为 .env 并填好");
  }
  if (!isAbsolutePath(trimmed)) {
    throw new Error("VAULT_PATH must be an absolute path");
  }
  if (isWholeHomeDirectory(trimmed)) {
    throw new Error(
      "VAULT_PATH points to a whole home directory. Choose a specific Vault or project folder.",
    );
  }
}

export function buildClaudeSpawnOptions({
  platform = process.platform,
  vaultPath,
  env = process.env,
}: {
  platform?: Platform;
  vaultPath: string;
  env?: NodeJS.ProcessEnv;
}): SpawnOptions {
  return {
    cwd: vaultPath,
    env,
    shell: platform === "win32",
  };
}
