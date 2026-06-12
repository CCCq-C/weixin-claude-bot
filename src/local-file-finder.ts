import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { FileSendIntent } from "./file-intent.js";
import { type FileCandidate, rankFileCandidates } from "./file-search.js";

const execFileAsync = promisify(execFile);

export type FindLocalFileOptions = {
  roots?: string[];
  now?: Date;
  limit?: number;
  timeoutMs?: number;
  maxScanned?: number;
  preserveRootOrder?: boolean;
};

const EXCLUDED_DIR_NAMES = new Set([
  ".git",
  ".Trash",
  ".cache",
  "Library",
  "node_modules",
  "__pycache__",
  "AppData",
  "Windows",
  "System Volume Information",
  "$Recycle.Bin",
]);

const EXCLUDED_ABSOLUTE_PREFIXES = [
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

export async function findLocalFileCandidates(
  intent: FileSendIntent,
  options: FindLocalFileOptions = {},
): Promise<FileCandidate[]> {
  const limit = options.limit ?? 5;
  const directCandidate = await statDirectPath(intent.query);
  if (directCandidate) return [directCandidate];

  const candidates: FileCandidate[] = [];

  if (!options.roots && process.platform === "darwin") {
    candidates.push(...(await findWithMdfind(intent, options.timeoutMs ?? 4000)));
  }

  const roots = options.roots ?? defaultSearchRoots();
  candidates.push(...(await scanRoots(roots, options)));

  const unique = dedupeByPath(candidates);
  if (options.preserveRootOrder && roots.length > 0) {
    const rankedByRoot = roots.flatMap((root) =>
      rankFileCandidates(
        unique.filter((candidate) => isUnderRoot(candidate.path, root)),
        {
          query: intent.query,
          extensions: intent.extensions,
          now: options.now,
          limit,
        },
      ),
    );
    return dedupeByPath(rankedByRoot).slice(0, limit);
  }
  return rankFileCandidates(unique, {
    query: intent.query,
    extensions: intent.extensions,
    now: options.now,
    limit,
  });
}

function isUnderRoot(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function findWithMdfind(intent: FileSendIntent, timeoutMs: number): Promise<FileCandidate[]> {
  const query = intent.query.trim();
  if (!query) return [];

  try {
    const { stdout } = await execFileAsync("/usr/bin/mdfind", ["-name", query], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    const paths = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((filePath) => !shouldSkipPath(filePath));
    return statsForPaths(paths);
  } catch {
    return [];
  }
}

async function scanRoots(
  roots: string[],
  options: FindLocalFileOptions,
): Promise<FileCandidate[]> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxScanned = options.maxScanned ?? 20_000;
  const candidates: FileCandidate[] = [];
  let scanned = 0;

  async function scanDir(dir: string): Promise<void> {
    if (Date.now() - startedAt > timeoutMs) return;
    if (scanned >= maxScanned) return;
    if (shouldSkipPath(dir)) return;

    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (scanned >= maxScanned || Date.now() - startedAt > timeoutMs) return;
      const fullPath = path.join(dir, entry.name);
      if (shouldSkipPath(fullPath, entry.name)) continue;
      scanned += 1;

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && maybeMatchesName(fullPath, options)) {
        const candidate = await statCandidate(fullPath);
        if (candidate) candidates.push(candidate);
      }
    }
  }

  for (const root of roots) {
    await scanDir(root);
  }
  return candidates;
}

function defaultSearchRoots(): string[] {
  const roots = new Set<string>();
  const fromEnv = (process.env.FILE_SEARCH_ROOTS ?? "")
    .split(path.delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const root of fromEnv) roots.add(root);

  const home = os.homedir();
  if (home) {
    roots.add(home);
    roots.add(path.join(home, "Desktop"));
    roots.add(path.join(home, "Downloads"));
    roots.add(path.join(home, "Documents"));
  }
  if (process.platform === "darwin") roots.add("/Volumes");
  return [...roots];
}

function maybeMatchesName(filePath: string, options: FindLocalFileOptions): boolean {
  void options;
  return path.basename(filePath).length > 0;
}

async function statsForPaths(paths: string[]): Promise<FileCandidate[]> {
  const candidates: FileCandidate[] = [];
  for (const filePath of paths) {
    const candidate = await statCandidate(filePath);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

async function statCandidate(filePath: string): Promise<FileCandidate | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stat.size,
      modifiedAt: stat.mtime,
    };
  } catch {
    return null;
  }
}

async function statDirectPath(query: string): Promise<FileCandidate | null> {
  const trimmed = query.trim().replace(/^["']|["']$/g, "");
  if (!path.isAbsolute(trimmed)) return null;
  return statCandidate(trimmed);
}

function shouldSkipPath(filePath: string, leafName = path.basename(filePath)): boolean {
  if (EXCLUDED_DIR_NAMES.has(leafName)) return true;
  return EXCLUDED_ABSOLUTE_PREFIXES.some(
    (prefix) => filePath === prefix || filePath.startsWith(`${prefix}/`),
  );
}

function dedupeByPath(candidates: FileCandidate[]): FileCandidate[] {
  const seen = new Set<string>();
  const unique: FileCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    unique.push(candidate);
  }
  return unique;
}
