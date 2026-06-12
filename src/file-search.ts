import path from "node:path";

export type FileCandidate = {
  path: string;
  name: string;
  size: number;
  modifiedAt: Date;
};

export type RankFileOptions = {
  query: string;
  extensions?: string[];
  now?: Date;
  limit?: number;
};

export type CandidateReplyOptions = {
  query: string;
  highRisk: boolean;
};

const SENSITIVE_NAME_PATTERN = /密码|secret|token|key|身份证|合同|财务/i;
const PREFERRED_DIR_PATTERN = /(?:^|[/\\])(Desktop|Downloads|Documents|Obsidian)(?:[/\\]|$)/i;

export function rankFileCandidates(
  files: FileCandidate[],
  options: RankFileOptions,
): FileCandidate[] {
  const tokens = tokenizeQuery(options.query);
  const timeHint = detectTimeHint(options.query);
  const expectedExtensions = new Set(
    (options.extensions ?? []).map((ext) => ext.toLowerCase()),
  );
  const now = options.now ?? new Date();
  const limit = options.limit ?? 5;

  return files
    .map((file) => ({
      file,
      score: scoreCandidate(file, tokens, expectedExtensions, now, timeHint),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.file.modifiedAt.getTime() - a.file.modifiedAt.getTime();
    })
    .slice(0, limit)
    .map(({ file }) => file);
}

export function buildCandidateReply(
  candidates: FileCandidate[],
  options: CandidateReplyOptions,
): string {
  if (candidates.length === 0) {
    return `没找到和「${options.query}」匹配的文件。请补充更具体的文件名、类型或时间。`;
  }

  const warning = options.highRisk
    ? "\n\n注意：候选里可能包含敏感文件。请确认文件名无误后再发送。"
    : "";

  if (candidates.length === 1) {
    return [
      `我找到：${formatCandidate(candidates[0])}`,
      `${warning}`,
      "回复“确认”后发送，或回复“取消”。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const lines = candidates.map((candidate, index) => {
    return `${index + 1}. ${formatCandidate(candidate)}`;
  });

  return [
    `我找到 ${candidates.length} 个可能的文件：`,
    "",
    ...lines,
    warning,
    "回复序号确认发送，或补充关键词继续找。",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function isSensitiveFileName(name: string): boolean {
  return SENSITIVE_NAME_PATTERN.test(name);
}

export function hasHighRiskCandidate(candidates: FileCandidate[]): boolean {
  return candidates.some((candidate) => isSensitiveFileName(candidate.name));
}

function scoreCandidate(
  file: FileCandidate,
  tokens: string[],
  expectedExtensions: Set<string>,
  now: Date,
  timeHint: TimeHint,
): number {
  const lowerName = file.name.toLowerCase();
  const lowerPath = file.path.toLowerCase();
  const ext = path.extname(file.name).toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (lowerName.includes(token)) score += token.length >= 2 ? 80 : 30;
    else if (lowerPath.includes(token)) score += 25;
  }

  if (tokens.length > 0 && lowerName.includes(tokens.join(""))) score += 40;
  if (expectedExtensions.size > 0 && expectedExtensions.has(ext)) score += 50;
  if (PREFERRED_DIR_PATTERN.test(file.path)) score += 10;

  const ageHours = Math.max(0, (now.getTime() - file.modifiedAt.getTime()) / 3_600_000);
  score += Math.max(0, 30 - Math.min(30, ageHours / 24));
  score += scoreTimeHint(file.modifiedAt, now, timeHint);

  return score;
}

type TimeHint = "today" | "yesterday" | "before-yesterday" | "last-week" | "recent" | null;

function detectTimeHint(query: string): TimeHint {
  if (query.includes("前天")) return "before-yesterday";
  if (query.includes("昨天")) return "yesterday";
  if (query.includes("今天")) return "today";
  if (query.includes("上周") || query.includes("上星期")) return "last-week";
  if (query.includes("最近") || query.includes("最新")) return "recent";
  return null;
}

function scoreTimeHint(modifiedAt: Date, now: Date, hint: TimeHint): number {
  if (!hint || hint === "recent") return 0;
  const dayDiff = differenceInLocalDays(now, modifiedAt);
  if (hint === "today") return dayDiff === 0 ? 100 : 0;
  if (hint === "yesterday") return dayDiff === 1 ? 100 : 0;
  if (hint === "before-yesterday") return dayDiff === 2 ? 100 : 0;
  if (hint === "last-week") return dayDiff >= 7 && dayDiff <= 14 ? 80 : 0;
  return 0;
}

function differenceInLocalDays(later: Date, earlier: Date): number {
  const laterDay = new Date(later.getFullYear(), later.getMonth(), later.getDate()).getTime();
  const earlierDay = new Date(
    earlier.getFullYear(),
    earlier.getMonth(),
    earlier.getDate(),
  ).getTime();
  return Math.round((laterDay - earlierDay) / 86_400_000);
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,，。！？、.!?_-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function formatCandidate(candidate: FileCandidate): string {
  return [
    candidate.name,
    formatFileSize(candidate.size),
    formatModifiedTime(candidate.modifiedAt),
    displayLocation(candidate.path),
  ].join("｜");
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  if (size >= 1024) return `${Math.round(size / 1024)}KB`;
  return `${size}B`;
}

function formatModifiedTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

function displayLocation(filePath: string): string {
  return path.basename(path.dirname(filePath)) || path.dirname(filePath);
}
