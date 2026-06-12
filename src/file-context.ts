import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type FileContext = {
  roots: string[];
};

type StoredFileContext = FileContext & {
  createdAt: string;
};

export type ExtractContextOptions = {
  homeDir?: string;
};

export type SaveContextOptions = ExtractContextOptions & {
  now?: Date;
};

const EXPIRES_MS = 60 * 60 * 1000;
const CONTEXT_WORD_PATTERN = /这个|那个|刚才|上面|前面|里面|文件|包|目录|文件夹/;
const EXPLICIT_LOCATION_PATTERN = /桌面|Desktop|下载|Downloads|文档|Documents/;

export function shouldUseFileContext(query: string): boolean {
  if (EXPLICIT_LOCATION_PATTERN.test(query)) return false;
  return CONTEXT_WORD_PATTERN.test(query) || query.trim().length > 0;
}

export function extractFileContextRoots(
  text: string,
  options: ExtractContextOptions = {},
): string[] {
  const homeDir = options.homeDir ?? os.homedir();
  const roots = new Set<string>();

  for (const raw of extractPathLikeValues(text)) {
    const expanded = expandHome(raw, homeDir);
    const root = likelyDirectoryRoot(expanded);
    if (root) roots.add(root);
  }

  if (/桌面|Desktop|文件夹内容|目录内容/i.test(text)) {
    for (const folderName of extractDesktopFolderNames(text)) {
      roots.add(path.join(homeDir, "Desktop", folderName));
    }
  }

  return [...roots];
}

export function saveFileContextFromText(
  dataDir: string,
  userId: string,
  text: string,
  options: SaveContextOptions = {},
): void {
  const roots = extractFileContextRoots(text, options).filter((root) => {
    try {
      return fs.statSync(root).isDirectory();
    } catch {
      return false;
    }
  });
  if (roots.length === 0) return;

  const file = contextFilePath(dataDir, userId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const stored: StoredFileContext = {
    roots: roots.slice(0, 10),
    createdAt: (options.now ?? new Date()).toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(stored, null, 2), "utf-8");
}

export function readFileContext(
  dataDir: string,
  userId: string,
  now = new Date(),
): FileContext | null {
  const file = contextFilePath(dataDir, userId);
  if (!fs.existsSync(file)) return null;

  try {
    const stored = JSON.parse(fs.readFileSync(file, "utf-8")) as StoredFileContext;
    const createdAt = new Date(stored.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return null;
    if (now.getTime() - createdAt.getTime() > EXPIRES_MS) {
      fs.unlinkSync(file);
      return null;
    }
    return { roots: stored.roots.filter((root) => fs.existsSync(root)) };
  } catch {
    return null;
  }
}

function extractPathLikeValues(text: string): string[] {
  const values = new Set<string>();
  const quotedPathPattern = /(?:^|[\s=])["']?((?:\$HOME|~|\/Users\/[^/"'\s]+)[^"'\n\r]*)["']?/g;
  for (const match of text.matchAll(quotedPathPattern)) {
    const value = match[1]?.trim();
    if (value) values.add(cleanPathValue(value));
  }
  return [...values];
}

function extractDesktopFolderNames(text: string): string[] {
  const names = new Set<string>();
  const folderLinePattern = /(?:^|\n)\s*(?:[-*•]\s*)?([A-Za-z0-9._-]+)\/(?:\s|$|[—-])/g;
  for (const match of text.matchAll(folderLinePattern)) {
    const name = match[1];
    if (name && !name.startsWith(".")) names.add(name);
  }

  let parentFolder: string | null = null;
  for (const line of text.split("\n")) {
    const folderName = extractFolderNameFromListingLine(line);
    if (!folderName || folderName.startsWith(".")) continue;

    if (/文件夹内容|目录内容/.test(line)) {
      parentFolder = folderName;
      names.add(folderName);
      continue;
    }

    names.add(parentFolder ? path.join(parentFolder, folderName) : folderName);
  }
  return [...names];
}

function extractFolderNameFromListingLine(line: string): string | null {
  const match = line.match(
    /^\s*(?:[-*•]\s*)?(?:[①②③④⑤⑥⑦⑧⑨⑩]|\d+[.)、]?)?\s*`?([^`/\n]+?)\/`?(?:\s|$|[—-])/u,
  );
  const name = match?.[1]?.trim();
  return name || null;
}

function expandHome(value: string, homeDir: string): string {
  if (value.startsWith("$HOME/")) return path.join(homeDir, value.slice("$HOME/".length));
  if (value.startsWith("~/")) return path.join(homeDir, value.slice(2));
  return value;
}

function likelyDirectoryRoot(value: string): string | null {
  const normalized = value.replace(/[，。；;,.!?]+$/g, "");
  const ext = path.extname(normalized);
  if (ext) return path.dirname(normalized);
  return normalized;
}

function cleanPathValue(value: string): string {
  return value
    .replace(/^`|`$/g, "")
    .replace(/["']$/g, "")
    .trim();
}

function contextFilePath(dataDir: string, userId: string): string {
  return path.join(dataDir, "file-contexts", `${Buffer.from(userId).toString("base64url")}.json`);
}
