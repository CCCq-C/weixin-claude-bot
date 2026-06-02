import "dotenv/config";

export const config = {
  vaultPath: process.env.VAULT_PATH ?? "",
  whitelistUserIds: (process.env.WHITELIST_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // 传给 claude --model 的别名/全名；空字符串表示用 Claude CLI 默认
  claudeModel: (process.env.CLAUDE_MODEL ?? "").trim(),
};

export function assertConfig(): void {
  if (!config.vaultPath) {
    throw new Error("VAULT_PATH 未配置 — 请 cp .env.example .env 并填好");
  }
}
