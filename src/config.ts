import "dotenv/config";
import { getClaudeCommand, validateVaultPath } from "./claude-command.js";

export const config = {
  vaultPath: process.env.VAULT_PATH ?? "",
  whitelistUserIds: (process.env.WHITELIST_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // 传给 claude --model 的别名/全名；空字符串表示用 Claude CLI 默认
  claudeModel: (process.env.CLAUDE_MODEL ?? "").trim(),
  // Claude CLI 命令覆写。默认用 PATH 中的 claude；Windows 特殊安装可填 claude.cmd 或绝对路径。
  claudeCommand: getClaudeCommand(process.env),
};

export function assertConfig(): void {
  validateVaultPath(config.vaultPath);
}
