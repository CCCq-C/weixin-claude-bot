import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ResolveFileQueryRootsOptions = {
  homeDir?: string;
  roots?: string[];
  timeoutMs?: number;
  maxScanned?: number;
};

type ScoredDirectory = {
  dir: string;
  score: number;
  baseIndex: number;
};

const EXCLUDED_DIR_NAMES = new Set([
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

const LOCATION_ROOTS: Array<{ pattern: RegExp; folder: string }> = [
  { pattern: /桌面|desktop/i, folder: "Desktop" },
  { pattern: /下载|downloads/i, folder: "Downloads" },
  { pattern: /文档|documents/i, folder: "Documents" },
];

const TOKEN_STOP_WORDS = new Set([
  "desktop",
  "downloads",
  "documents",
  "file",
  "files",
  "folder",
  "folders",
  "directory",
  "dir",
  "md",
  "markdown",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "png",
  "jpg",
  "jpeg",
  "mp4",
  "mov",
]);

export async function resolveFileQueryRoots(
  query: string,
  options: ResolveFileQueryRootsOptions = {},
): Promise<string[]> {
  const directRoots = resolveDirectDirectories(query);
  if (directRoots.length > 0) return directRoots;

  const homeDir = options.homeDir ?? os.homedir();
  const baseRoots = resolveBaseRoots(query, homeDir, options.roots);
  if (!hasDirectoryCue(query)) return [];
  const keywords = extractFolderKeywords(query);
  if (keywords.length === 0 || baseRoots.length === 0) return [];

  const timeoutMs = options.timeoutMs ?? 4000;
  const maxScanned = options.maxScanned ?? 10_000;
  const scanned = await scanDirectoryRoots(baseRoots, keywords, timeoutMs, maxScanned);
  const mdfindMatches =
    process.platform === "darwin"
      ? await findDirectoriesWithMdfind(baseRoots, keywords, timeoutMs)
      : [];
  return rankDirectories([...scanned, ...mdfindMatches], query, keywords, baseRoots);
}

function resolveDirectDirectories(query: string): string[] {
  const roots: string[] = [];
  const quotedPathPattern = /["“']([^"”']+)["”']/g;
  for (const match of query.matchAll(quotedPathPattern)) {
    const maybePath = match[1]?.trim();
    if (maybePath && path.isAbsolute(maybePath) && isDirectory(maybePath)) {
      roots.push(maybePath);
    }
  }

  const absolutePathPattern =
    /(?:^|[\s：:])((?:\/|[A-Za-z]:[\\/])[\s\S]+?)(?=\s*(?:里面|里的|目录|文件夹|文件|下|中|发我|发给我|发过来|发送|$))/g;
  for (const match of query.matchAll(absolutePathPattern)) {
    const maybePath = cleanPathCandidate(match[1] ?? "");
    if (maybePath && path.isAbsolute(maybePath) && isDirectory(maybePath)) {
      roots.push(maybePath);
    }
  }

  return dedupe(roots);
}

function cleanPathCandidate(candidate: string): string {
  return candidate
    .trim()
    .replace(/^["“']|["”']$/g, "")
    .replace(/[，。！？、,.!?]+$/g, "")
    .trim();
}

function resolveBaseRoots(query: string, homeDir: string, configuredRoots?: string[]): string[] {
  const roots: string[] = [];
  for (const location of LOCATION_ROOTS) {
    if (location.pattern.test(query)) {
      roots.push(path.join(homeDir, location.folder));
    }
  }

  if (roots.length === 0) {
    roots.push(...(configuredRoots ?? defaultSearchRoots(homeDir)));
  }

  return dedupe(roots).filter(isDirectory);
}

function hasDirectoryCue(query: string): boolean {
  return /桌面|desktop|下载|downloads|文档|documents|文件夹|目录|里面|里的|里|下|中|包/i.test(
    query,
  );
}

function defaultSearchRoots(homeDir: string): string[] {
  return [
    path.join(homeDir, "Desktop"),
    path.join(homeDir, "Downloads"),
    path.join(homeDir, "Documents"),
    homeDir,
  ];
}

function extractFolderKeywords(query: string): string[] {
  const normalized = query
    .replace(/[，。！？、,.!?]/g, " ")
    .replace(/[“”"'`]/g, " ")
    .toLowerCase();
  const keywords = new Set<string>();
  for (const phrase of extractPhraseKeywords(normalized)) {
    keywords.add(phrase);
  }
  const tokens = normalized
    .match(/[a-z0-9][a-z0-9._-]{1,}/g)
    ?.map((token) => token.trim())
    .filter((token) => token.length >= 2 && !TOKEN_STOP_WORDS.has(token));
  for (const token of tokens ?? []) {
    keywords.add(token);
  }
  return [...keywords].sort((a, b) => b.length - a.length);
}

function extractPhraseKeywords(text: string): string[] {
  const keywords: string[] = [];
  const patterns = [
    /(?:^|\s)([\p{Script=Han}a-z0-9._\-\s]{2,}?)\s*(?:里|下|中)/giu,
    /(?:桌面上?|下载里?|文档里?)\s*([\p{Script=Han}a-z0-9._\-\s]{2,})/giu,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const cleaned = cleanPhraseKeyword(match[1] ?? "");
      if (cleaned) keywords.push(cleaned);
    }
  }
  return dedupe(keywords);
}

function cleanPhraseKeyword(phrase: string): string {
  return phrase
    .replace(
      /桌面|下载|文档|desktop|downloads|documents|文件夹|目录|文件|里面|里的|那个|这个|发我|发给我|发过来|发送|传给我|帮我|我要|我需要|需要|给我|上|下|中|的|包/gi,
      " ",
    )
    .replace(/\b(md|markdown|pdf|docx?|xlsx?|pptx?|png|jpe?g|mp4|mov)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function scanDirectoryRoots(
  baseRoots: string[],
  keywords: string[],
  timeoutMs: number,
  maxScanned: number,
): Promise<string[]> {
  const startedAt = Date.now();
  const matches: string[] = [];
  let scanned = 0;

  async function scanDir(dir: string): Promise<void> {
    if (Date.now() - startedAt > timeoutMs || scanned >= maxScanned) return;
    if (shouldSkipPath(dir)) return;

    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (Date.now() - startedAt > timeoutMs || scanned >= maxScanned) return;
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dir, entry.name);
      if (shouldSkipPath(fullPath, entry.name)) continue;
      scanned += 1;

      if (directoryNameMatches(entry.name, keywords)) {
        matches.push(fullPath);
      }
      await scanDir(fullPath);
    }
  }

  for (const root of baseRoots) {
    await scanDir(root);
  }
  return matches;
}

async function findDirectoriesWithMdfind(
  baseRoots: string[],
  keywords: string[],
  timeoutMs: number,
): Promise<string[]> {
  const matches: string[] = [];
  for (const keyword of keywords) {
    for (const root of baseRoots) {
      try {
        const { stdout } = await execFileAsync("/usr/bin/mdfind", ["-onlyin", root, "-name", keyword], {
          timeout: Math.max(500, Math.min(timeoutMs, 3000)),
          maxBuffer: 1024 * 1024,
        });
        for (const line of stdout.split("\n")) {
          const candidate = line.trim();
          if (candidate && isDirectory(candidate) && !shouldSkipPath(candidate)) {
            matches.push(candidate);
          }
        }
      } catch {
        // Spotlight is an accelerator only; directory scanning remains the fallback.
      }
    }
  }
  return matches;
}

function directoryNameMatches(name: string, keywords: string[]): boolean {
  const lowerName = name.toLowerCase();
  return keywords.some((keyword) => lowerName === keyword || lowerName.includes(keyword));
}

function rankDirectories(
  directories: string[],
  query: string,
  keywords: string[],
  baseRoots: string[],
): string[] {
  const lowerQuery = query.toLowerCase();
  const scored: ScoredDirectory[] = [];
  for (const dir of dedupe(directories)) {
    const name = path.basename(dir).toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      if (name === keyword) score += 100;
      else if (name.includes(keyword)) score += 70;
    }
    if (lowerQuery.includes(name)) score += 40;
    if (score <= 0) continue;

    scored.push({
      dir,
      score,
      baseIndex: baseRoots.findIndex((root) => isUnderRoot(dir, root)),
    });
  }

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.baseIndex !== b.baseIndex) return a.baseIndex - b.baseIndex;
      return a.dir.length - b.dir.length;
    })
    .slice(0, 5)
    .map(({ dir }) => dir);
}

function shouldSkipPath(filePath: string, leafName = path.basename(filePath)): boolean {
  if (EXCLUDED_DIR_NAMES.has(leafName)) return true;
  return EXCLUDED_ABSOLUTE_PREFIXES.some(
    (prefix) => filePath === prefix || filePath.startsWith(`${prefix}/`),
  );
}

function isDirectory(filePath: string): boolean {
  try {
    return fsSync.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function isUnderRoot(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
