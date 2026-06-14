import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FileSendIntent } from "./file-intent.js";
import { type FileCandidate, rankFileCandidates } from "./file-search.js";
import { isUnderRoot, runMdfind, walkDirectoryTree } from "./fs-walk.js";

export type FindLocalFileOptions = {
  roots?: string[];
  now?: Date;
  limit?: number;
  timeoutMs?: number;
  maxScanned?: number;
  preserveRootOrder?: boolean;
};

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

async function findWithMdfind(intent: FileSendIntent, timeoutMs: number): Promise<FileCandidate[]> {
  const query = intent.query.trim();
  if (!query) return [];

  return statsForPaths(await runMdfind(["-name", query], timeoutMs));
}

async function scanRoots(
  roots: string[],
  options: FindLocalFileOptions,
): Promise<FileCandidate[]> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxScanned = options.maxScanned ?? 20_000;
  const candidates: FileCandidate[] = [];
  await walkDirectoryTree({
    roots,
    timeoutMs,
    maxScanned,
    async onEntry({ path: fullPath, entry }) {
      if (!entry.isFile() || !maybeMatchesName(fullPath, options)) return;
      const candidate = await statCandidate(fullPath);
      if (candidate) candidates.push(candidate);
    },
  });
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
