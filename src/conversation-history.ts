import fs from "node:fs";
import path from "node:path";
import { resolveFileContextRootsFromText, type ExtractContextOptions } from "./file-context.js";

export type ConversationRole = "user" | "assistant";

export type ConversationTurn = {
  role: ConversationRole;
  content: string;
  roots: string[];
  createdAt: string;
};

export type ConversationHistory = {
  turns: ConversationTurn[];
};

export type AppendConversationOptions = ExtractContextOptions & {
  now?: Date;
};

const EXPIRES_MS = 24 * 60 * 60 * 1000;
const MAX_TURNS = 30;
const MAX_CONTENT_LENGTH = 4000;

export function appendConversationTurn(
  dataDir: string,
  userId: string,
  turn: { role: ConversationRole; content: string },
  options: AppendConversationOptions = {},
): ConversationHistory {
  const now = options.now ?? new Date();
  const previous = readConversationHistory(dataDir, userId, now) ?? { turns: [] };
  const previousRoots = uniqueRoots(previous.turns.flatMap((item) => item.roots));
  const roots = resolveFileContextRootsFromText(turn.content, previousRoots, options);
  const next: ConversationHistory = {
    turns: [
      ...previous.turns,
      {
        role: turn.role,
        content: sanitizeContent(turn.content).slice(0, MAX_CONTENT_LENGTH),
        roots,
        createdAt: now.toISOString(),
      },
    ].slice(-MAX_TURNS),
  };

  const file = conversationFilePath(dataDir, userId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function readConversationHistory(
  dataDir: string,
  userId: string,
  now = new Date(),
): ConversationHistory | null {
  const file = conversationFilePath(dataDir, userId);
  if (!fs.existsSync(file)) return null;

  try {
    const stored = JSON.parse(fs.readFileSync(file, "utf-8")) as ConversationHistory;
    const turns = (stored.turns ?? [])
      .filter((turn) => isFreshTurn(turn, now))
      .map((turn) => ({
        role: turn.role,
        content: String(turn.content ?? ""),
        roots: (turn.roots ?? []).filter((root) => isExistingDirectory(root)),
        createdAt: turn.createdAt,
      }));
    return { turns };
  } catch {
    return null;
  }
}

export function rootsFromConversationHistory(
  history: ConversationHistory | null | undefined,
  query: string,
): string[] {
  if (!history) return [];
  const roots = uniqueRoots(history.turns.flatMap((turn) => turn.roots).reverse());
  const tokens = queryTokens(query);
  if (tokens.length === 0) return roots;

  const matching = roots.filter((root) => {
    const lower = root.toLowerCase();
    return tokens.some((token) => lower.includes(token));
  });
  return uniqueRoots([...matching, ...roots]);
}

function conversationFilePath(dataDir: string, userId: string): string {
  return path.join(dataDir, "conversations", `${Buffer.from(userId).toString("base64url")}.json`);
}

function isFreshTurn(turn: ConversationTurn, now: Date): boolean {
  const createdAt = new Date(turn.createdAt);
  if (!Number.isFinite(createdAt.getTime())) return false;
  return now.getTime() - createdAt.getTime() <= EXPIRES_MS;
}

function isExistingDirectory(root: string): boolean {
  try {
    return fs.statSync(root).isDirectory();
  } catch {
    return false;
  }
}

function uniqueRoots(roots: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const root of roots) {
    if (seen.has(root)) continue;
    seen.add(root);
    out.push(root);
  }
  return out;
}

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,，。；;：:、"'`()[\]{}<>]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function sanitizeContent(content: string): string {
  return content
    .replace(/(botToken|bot_token|api[_-]?key|authorization|token)\s*[:=]\s*[^\s"'，。]+/gi, "$1=[REDACTED]")
    .replace(/(x-encrypted-param=)[^\s"'，。]+/gi, "$1[REDACTED]");
}
