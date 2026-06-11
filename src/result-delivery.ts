import fs from "node:fs";
import path from "node:path";

export const DEFAULT_DIRECT_REPLY_LIMIT = 1200;
export const RESULT_ARCHIVE_DIR = "微信Bot回复归档";

type PrepareResultDeliveryOptions = {
  vaultPath: string;
  userId: string;
  result: string;
  now?: Date;
  directReplyLimit?: number;
};

export type PreparedResultDelivery = {
  messages: string[];
  archived: boolean;
  archivePath?: string;
  relativeArchivePath?: string;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTimestamp(d: Date): string {
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
  ].join("-") + `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function sanitizeFilePart(s: string): string {
  return (
    s
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "user"
  );
}

function toDisplayPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function buildPreview(result: string, limit: number): string {
  const compact = result.trim();
  if (!compact) return "";
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

export function prepareResultDelivery(
  options: PrepareResultDeliveryOptions,
): PreparedResultDelivery {
  const result = options.result.trim();
  if (!result) {
    return {
      archived: false,
      messages: ["Claude 没有返回可发送的文本。请查看终端日志或稍后重试。"],
    };
  }

  const directReplyLimit = options.directReplyLimit ?? DEFAULT_DIRECT_REPLY_LIMIT;
  if (result.length <= directReplyLimit) {
    return { archived: false, messages: [result] };
  }

  const archiveDir = path.join(options.vaultPath, RESULT_ARCHIVE_DIR);
  fs.mkdirSync(archiveDir, { recursive: true });

  const filename = `${formatTimestamp(options.now ?? new Date())}-${sanitizeFilePart(
    options.userId,
  )}.md`;
  const archivePath = path.join(archiveDir, filename);
  const relativeArchivePath = toDisplayPath(path.join(RESULT_ARCHIVE_DIR, filename));

  const body = [
    "# 微信 Bot 回复归档",
    "",
    `- 时间: ${(options.now ?? new Date()).toISOString()}`,
    `- 用户: ${options.userId}`,
    `- 原始长度: ${result.length} 字符`,
    "",
    "---",
    "",
    result,
    "",
  ].join("\n");

  fs.writeFileSync(archivePath, body, "utf-8");

  const preview = buildPreview(result, 360);
  const message = [
    "结果比较长，我已写入仓库：",
    relativeArchivePath,
    "",
    "微信里只发短预览，完整内容请打开上面的文件。",
    preview ? `\n预览：\n${preview}` : "",
  ].join("\n").trim();

  return {
    archived: true,
    archivePath,
    relativeArchivePath,
    messages: [message],
  };
}
