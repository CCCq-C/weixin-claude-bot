import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const EXCLUDED_DIR_NAMES = new Set([
  ".git",
  ".Trash",
  ".cache",
  ".npm",
  ".pnpm-store",
  "__pycache__",
  "node_modules",
  "Library",
  "AppData",
  "Windows",
  "System Volume Information",
  "$Recycle.Bin",
]);

export const EXCLUDED_ABSOLUTE_PREFIXES = [
  "/System",
  "/Library",
  "/Applications",
  "/usr",
  "/bin",
  "/sbin",
  "/private",
  "/dev",
  "/proc",
];

export type WalkEntry = {
  path: string;
  entry: import("node:fs").Dirent;
};

export type WalkDirectoryOptions = {
  roots: string[];
  timeoutMs: number;
  maxScanned: number;
  countEntry?: (entry: WalkEntry) => boolean;
  onEntry: (entry: WalkEntry) => Promise<void> | void;
};

export function shouldSkipPath(
  filePath: string,
  leafName = path.basename(filePath),
): boolean {
  if (EXCLUDED_DIR_NAMES.has(leafName)) return true;
  return EXCLUDED_ABSOLUTE_PREFIXES.some(
    (prefix) => filePath === prefix || filePath.startsWith(`${prefix}/`),
  );
}

export function isUnderRoot(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function walkDirectoryTree(options: WalkDirectoryOptions): Promise<void> {
  const startedAt = Date.now();
  let scanned = 0;

  async function scanDir(dir: string): Promise<void> {
    if (Date.now() - startedAt > options.timeoutMs) return;
    if (scanned >= options.maxScanned) return;
    if (shouldSkipPath(dir)) return;

    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (scanned >= options.maxScanned || Date.now() - startedAt > options.timeoutMs) return;
      const fullPath = path.join(dir, entry.name);
      if (shouldSkipPath(fullPath, entry.name)) continue;

      const walkEntry = { path: fullPath, entry };
      if (options.countEntry?.(walkEntry) ?? true) scanned += 1;
      await options.onEntry(walkEntry);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      }
    }
  }

  for (const root of options.roots) {
    await scanDir(root);
  }
}

export async function runMdfind(args: string[], timeoutMs: number): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/mdfind", args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((filePath) => !shouldSkipPath(filePath));
  } catch {
    return [];
  }
}
