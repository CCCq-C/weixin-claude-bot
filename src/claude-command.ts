import path from "node:path";
import fs from "node:fs";
import type { SpawnOptions } from "node:child_process";

type Platform = NodeJS.Platform;
type FileExists = (filePath: string) => boolean;

export type ClaudeSpawnInvocation = {
  command: string;
  args: string[];
  useShell: boolean;
};

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
  useShell = platform === "win32",
}: {
  platform?: Platform;
  vaultPath: string;
  env?: NodeJS.ProcessEnv;
  useShell?: boolean;
}): SpawnOptions {
  return {
    cwd: vaultPath,
    env,
    shell: useShell,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: platform === "win32",
  };
}

function pathEnv(env: NodeJS.ProcessEnv): string {
  return env.Path ?? env.PATH ?? "";
}

function windowsClaudeExeCandidates(
  command: string,
  env: NodeJS.ProcessEnv,
): string[] {
  const candidates: string[] = [];
  const packageExe = path.win32.join(
    "node_modules",
    "@anthropic-ai",
    "claude-code",
    "bin",
    "claude.exe",
  );

  if (path.win32.isAbsolute(command)) {
    candidates.push(path.win32.join(path.win32.dirname(command), packageExe));
  }
  if (env.APPDATA) {
    candidates.push(path.win32.join(env.APPDATA, "npm", packageExe));
  }
  if (env.npm_config_prefix) {
    candidates.push(path.win32.join(env.npm_config_prefix, packageExe));
  }

  for (const dir of pathEnv(env).split(path.win32.delimiter).filter(Boolean)) {
    candidates.push(path.win32.join(dir, packageExe));
  }

  return Array.from(new Set(candidates));
}

function resolveWindowsClaudeExecutable({
  command,
  env,
  fileExists,
}: {
  command: string;
  env: NodeJS.ProcessEnv;
  fileExists: FileExists;
}): string | undefined {
  const normalized = command.replace(/\//g, "\\").toLowerCase();
  if (normalized.endsWith("\\claude.exe") || normalized === "claude.exe") {
    return command;
  }

  if (
    normalized !== "claude" &&
    normalized !== "claude.cmd" &&
    !normalized.endsWith("\\claude.cmd")
  ) {
    return undefined;
  }

  return windowsClaudeExeCandidates(command, env).find(fileExists);
}

function resolveWindowsClaudeCmdShim({
  command,
  fileExists,
}: {
  command: string;
  fileExists: FileExists;
}): string {
  const normalized = command.replace(/\//g, "\\").toLowerCase();
  if (normalized === "claude") return "claude.cmd";
  if (normalized === "claude.cmd" || normalized.endsWith("\\claude.cmd")) {
    return command;
  }
  if (path.win32.isAbsolute(command) && !path.win32.extname(command)) {
    const cmdPath = `${command}.cmd`;
    if (fileExists(cmdPath)) return cmdPath;
  }
  return command;
}

export function buildClaudeSpawnInvocation({
  command,
  args,
  platform = process.platform,
  env = process.env,
  fileExists = fs.existsSync,
}: {
  command: string;
  args: string[];
  platform?: Platform;
  env?: NodeJS.ProcessEnv;
  fileExists?: FileExists;
}): ClaudeSpawnInvocation {
  if (platform !== "win32") {
    return { command, args, useShell: false };
  }

  const executable = resolveWindowsClaudeExecutable({ command, env, fileExists });
  if (executable) {
    return { command: executable, args, useShell: false };
  }

  return {
    command: resolveWindowsClaudeCmdShim({ command, fileExists }),
    args,
    useShell: true,
  };
}

export function buildHiddenPowerShellInvocation({
  scriptPath,
}: {
  scriptPath: string;
}): ClaudeSpawnInvocation {
  return {
    command: "powershell.exe",
    args: [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-WindowStyle",
      "Hidden",
      "-File",
      scriptPath,
    ],
    useShell: false,
  };
}
