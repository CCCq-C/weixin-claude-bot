export type FileIntentKind = "send" | "search";

export type FileSendIntent = {
  kind: FileIntentKind;
  query: string;
  extensions: string[];
};

export type FileSelectionReply =
  | { type: "select"; index: number }
  | { type: "confirm" }
  | { type: "cancel" };

const FILE_WORD_EXTENSIONS: Array<{ words: string[]; extensions: string[] }> = [
  { words: ["ppt", "pptx", "课件", "幻灯片"], extensions: [".ppt", ".pptx"] },
  { words: ["excel", "xlsx", "xls", "表格"], extensions: [".xls", ".xlsx"] },
  { words: ["word", "docx", "doc", "文档"], extensions: [".doc", ".docx"] },
  { words: ["pdf"], extensions: [".pdf"] },
  { words: ["图片", "照片", "png", "jpg", "jpeg"], extensions: [".png", ".jpg", ".jpeg"] },
  { words: ["视频", "mp4", "mov"], extensions: [".mp4", ".mov"] },
  { words: ["音频", "录音", "mp3", "wav", "m4a"], extensions: [".mp3", ".wav", ".m4a"] },
];

const SEND_PATTERNS = [
  /发我/,
  /发给我/,
  /发过来/,
  /发一下/,
  /发来/,
  /发个/,
  /传给我/,
  /传一下/,
  /发送/,
  /给我那个/,
  /给我.*文件/,
  /把.+发/,
];

const SEARCH_PATTERNS = [
  /找一下/,
  /找找/,
  /帮我找/,
  /查一下/,
];

const NON_SEND_PATTERNS = [
  /怎么写/,
  /如何写/,
  /总结/,
  /分析/,
  /解释/,
  /帮我写/,
  /改一下/,
  /润色/,
];

const FILLER_WORDS = [
  "把",
  "那个",
  "这个",
  "文件",
  "发我",
  "发给我",
  "发过来",
  "发一下",
  "发来",
  "发个",
  "传给我",
  "传一下",
  "发送",
  "一下",
  "帮我",
  "找一下",
  "找找",
  "找",
  "查一下",
  "给我",
  "最近的",
  "最近",
  "那个",
];

export function parseFileSendIntent(text: string): FileSendIntent | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  const debugMatch = normalized.match(/^\/sendfile\s+(.+)$/i);
  if (debugMatch?.[1]) {
    const query = debugMatch[1].trim();
    return { kind: "send", query, extensions: detectExtensions(query) };
  }
  if (NON_SEND_PATTERNS.some((pattern) => pattern.test(normalized))) return null;

  const kind = detectKind(normalized);
  if (!kind) return null;

  const extensions = detectExtensions(normalized);
  const query = buildQuery(normalized);
  if (!query && extensions.length === 0) return null;

  return { kind, query: query || normalized, extensions };
}

export function parseFileSelectionReply(text: string): FileSelectionReply | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  if (/^(取消|算了|不用了|不要了|cancel|\/cancel|\/stop)$/i.test(normalized)) {
    return { type: "cancel" };
  }
  if (/^(确认|确定|就这个|发送|发吧|可以|是的|对)$/i.test(normalized)) {
    return { type: "confirm" };
  }

  const match = normalized.match(/^(?:第)?\s*([1-9]\d*)\s*(?:个)?$/);
  if (match) {
    return { type: "select", index: Number(match[1]) - 1 };
  }

  return null;
}

function detectKind(text: string): FileIntentKind | null {
  if (SEND_PATTERNS.some((pattern) => pattern.test(text))) return "send";
  if (SEARCH_PATTERNS.some((pattern) => pattern.test(text)) && detectExtensions(text).length > 0) {
    return "search";
  }
  return null;
}

function detectExtensions(text: string): string[] {
  const found = new Set<string>();
  for (const mapping of FILE_WORD_EXTENSIONS) {
    if (mapping.words.some((word) => text.toLowerCase().includes(word.toLowerCase()))) {
      mapping.extensions.forEach((ext) => found.add(ext));
    }
  }
  return [...found];
}

function buildQuery(text: string): string {
  let query = text;
  for (const word of FILLER_WORDS) {
    query = query.replaceAll(word, " ");
  }
  query = query
    .replace(/[，。！？、,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return query;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}
