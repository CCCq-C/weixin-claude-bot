import { spawn } from "node:child_process";
import { config } from "./config.js";
import {
  buildClaudeSpawnInvocation,
  buildClaudeSpawnOptions,
} from "./claude-command.js";
import { parseFileSendIntent, type FileSendIntent } from "./file-intent.js";

export type AiRoute = "normal_task" | "send_existing_file" | "search_existing_file" | "unknown";

export type AiIntentDecision = {
  route: AiRoute;
  confidence?: number;
  fileQuery?: string;
  fileTypes?: string[];
  reason?: string;
};

export type ResolveFileIntentOptions = {
  classifyWithAi?: (text: string) => Promise<AiIntentDecision | null>;
  minConfidence?: number;
};

const AI_ROUTER_TIMEOUT_MS = 8_000;
const FILE_TYPE_EXTENSIONS: Record<string, string[]> = {
  html: [".html", ".htm"],
  htm: [".html", ".htm"],
  网页: [".html", ".htm"],
  word: [".doc", ".docx"],
  doc: [".doc", ".docx"],
  docx: [".doc", ".docx"],
  文档: [".doc", ".docx"],
  excel: [".xls", ".xlsx"],
  xls: [".xls", ".xlsx"],
  xlsx: [".xls", ".xlsx"],
  表格: [".xls", ".xlsx"],
  ppt: [".ppt", ".pptx"],
  pptx: [".ppt", ".pptx"],
  pdf: [".pdf"],
  json: [".json"],
  md: [".md", ".markdown"],
  markdown: [".md", ".markdown"],
  图片: [".png", ".jpg", ".jpeg"],
  照片: [".png", ".jpg", ".jpeg"],
  png: [".png"],
  jpg: [".jpg", ".jpeg"],
  jpeg: [".jpg", ".jpeg"],
  视频: [".mp4", ".mov"],
  mp4: [".mp4"],
  mov: [".mov"],
  音频: [".mp3", ".wav", ".m4a"],
  录音: [".mp3", ".wav", ".m4a"],
  mp3: [".mp3"],
  wav: [".wav"],
  m4a: [".m4a"],
};

export async function resolveFileIntent(
  text: string,
  options: ResolveFileIntentOptions = {},
): Promise<FileSendIntent | null> {
  const deterministic = parseFileSendIntent(text);
  if (text.trim().startsWith("/")) return deterministic;

  const aiDecision = options.classifyWithAi
    ? await safeClassifyWithAi(options.classifyWithAi, text)
    : null;
  if (!options.classifyWithAi) return deterministic;
  return applyAiIntentDecision(text, deterministic, aiDecision, options.minConfidence);
}

export function shouldAskAiRouter(
  text: string,
  deterministic: FileSendIntent | null = parseFileSendIntent(text),
): boolean {
  if (text.trim().startsWith("/")) return false;
  void deterministic;
  return text.trim().length > 0;
}

export function applyAiIntentDecision(
  text: string,
  deterministic: FileSendIntent | null,
  aiDecision: AiIntentDecision | null,
  minConfidence = 0.65,
): FileSendIntent | null {
  if (!aiDecision || (aiDecision.confidence ?? 0) < minConfidence) return deterministic;

  if (aiDecision.route === "normal_task") return null;

  if (aiDecision.route === "send_existing_file" || aiDecision.route === "search_existing_file") {
    const query = (aiDecision.fileQuery ?? deterministic?.query ?? text).trim();
    if (!query) return deterministic;
    const extensions = extensionsFromAiTypes(aiDecision.fileTypes, query);
    return {
      kind: aiDecision.route === "search_existing_file" ? "search" : "send",
      query,
      extensions: extensions.length > 0 ? extensions : deterministic?.extensions ?? [],
      rawText: text.trim().replace(/\s+/g, " "),
    };
  }

  return deterministic;
}

export function parseAiIntentRouterOutput(output: string): AiIntentDecision | null {
  const raw = output.trim();
  if (!raw) return null;

  const parsed = parseJsonObject(raw);
  const candidate = isObject(parsed) && typeof parsed.result === "string"
    ? parseJsonObject(parsed.result)
    : parsed;
  if (!isObject(candidate)) return null;

  const route = normalizeRoute(candidate.route);
  if (!route) return null;

  return {
    route,
    confidence: typeof candidate.confidence === "number" ? candidate.confidence : undefined,
    fileQuery: stringValue(candidate.file_query ?? candidate.fileQuery),
    fileTypes: stringArray(candidate.file_types ?? candidate.fileTypes),
    reason: stringValue(candidate.reason),
  };
}

export function buildIntentRouterPrompt(userText: string): string {
  return [
    "你是微信 bot 的意图路由器。只判断用户这句话应该走哪个内部流程。",
    "",
    "可选 route：",
    "- normal_task：用户要 AI 写作、生成、整理、分析、创建文件、保存文件、执行任务、回答问题、浏览目录、查看文件夹、打开文件夹。",
    "- send_existing_file：用户要查找并发送电脑上已经存在的文件。",
    "- search_existing_file：用户只想找/列出电脑上已有文件，尚未明确发送。",
    "- unknown：无法判断。",
    "",
    "关键规则：",
    "1. 如果用户说写、生成、创作、整理成 Word/PPT/PDF、保存到桌面/文件夹，即使出现“发给我”，也必须是 normal_task。",
    "2. 如果用户只是想看桌面/下载/某个文件夹里有什么，或者让 AI 打开文件夹看看，这是 normal_task，不是 search_existing_file。",
    "3. 只有用户要把电脑上已经存在的文件作为微信附件发回来时，才是 send_existing_file。",
    "4. 如果用户只是要找已有文件但没有说发送，才是 search_existing_file。",
    "5. file_query 只写用于本地找文件的关键词，不要写整句。",
    "6. 只返回 JSON，不要 Markdown，不要解释。",
    "",
    "JSON 格式：",
    '{"route":"normal_task|send_existing_file|search_existing_file|unknown","confidence":0.0,"file_query":"","file_types":[],"reason":""}',
    "",
    `用户消息：${userText}`,
  ].join("\n");
}

export async function classifyUserIntentWithClaude(text: string): Promise<AiIntentDecision | null> {
  const args = ["-p", buildIntentRouterPrompt(text), "--output-format", "json"];
  if (config.claudeModel) args.push("--model", config.claudeModel);
  const invocation = buildClaudeSpawnInvocation({
    command: config.claudeCommand,
    args,
    env: process.env,
  });

  return new Promise((resolve) => {
    const proc = spawn(
      invocation.command,
      invocation.args,
      buildClaudeSpawnOptions({
        vaultPath: config.vaultPath,
        env: process.env,
        useShell: invocation.useShell,
      }),
    );
    let stdout = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    proc.stderr?.on("data", () => {
      // Drain stderr so a noisy Claude CLI cannot block the short router process.
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
    }, AI_ROUTER_TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve(parseAiIntentRouterOutput(stdout));
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

async function safeClassifyWithAi(
  classifyWithAi: (text: string) => Promise<AiIntentDecision | null>,
  text: string,
): Promise<AiIntentDecision | null> {
  try {
    return await classifyWithAi(text);
  } catch {
    return null;
  }
}

function extensionsFromAiTypes(fileTypes: string[] | undefined, query: string): string[] {
  const found = new Set<string>();
  for (const value of [...(fileTypes ?? []), query]) {
    const lower = value.toLowerCase();
    for (const [key, extensions] of Object.entries(FILE_TYPE_EXTENSIONS)) {
      if (lower.includes(key.toLowerCase())) {
        extensions.forEach((ext) => found.add(ext));
      }
    }
  }
  return [...found];
}

function normalizeRoute(value: unknown): AiRoute | null {
  if (
    value === "normal_task" ||
    value === "send_existing_file" ||
    value === "search_existing_file" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function parseJsonObject(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    const match = input.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
