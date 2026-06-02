export type AgentCapabilities = {
  text: true;
  vision: boolean;
  fileRead: boolean;
  audio: boolean;
};

export type AttachmentContext = {
  kind: "image" | "file" | "audio" | "video";
  mime: string;
  path: string;
  extractedText?: string;
  markdown?: string;
};

export const CLAUDE_CODE_CAPABILITIES: AgentCapabilities = {
  text: true,
  vision: true,
  fileRead: true,
  audio: false,
};

export const TEXT_ONLY_CAPABILITIES: AgentCapabilities = {
  text: true,
  vision: false,
  fileRead: false,
  audio: false,
};

export function buildAgentInput({
  userText,
  attachments = [],
  capabilities,
}: {
  userText: string;
  attachments?: AttachmentContext[];
  capabilities: AgentCapabilities;
}): string {
  if (attachments.length === 0) return userText;

  const sections = [userText, "", "附件上下文："];
  for (const attachment of attachments) {
    sections.push(`- 类型：${attachment.kind}`);
    sections.push(`  MIME：${attachment.mime}`);
    sections.push(`  路径：${attachment.path}`);

    if (attachment.markdown) {
      sections.push("  已转换 Markdown：");
      sections.push(attachment.markdown);
      continue;
    }
    if (attachment.extractedText) {
      sections.push("  已提取文本：");
      sections.push(attachment.extractedText);
      continue;
    }
    if (capabilities.fileRead) {
      sections.push("  处理建议：请直接读取附件路径完成用户任务。");
      continue;
    }
    if (attachment.kind === "image" && capabilities.vision) {
      sections.push("  处理建议：当前 Agent 支持视觉，可结合图片内容完成任务。");
      continue;
    }
    sections.push("  处理建议：当前 Agent 无法直接解析该附件，只能先保存并提示用户。");
  }

  return sections.join("\n");
}
