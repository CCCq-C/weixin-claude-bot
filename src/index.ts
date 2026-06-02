/**
 * 入口（M3 阶段）：
 *   - 没 data/account.json → 走扫码登录
 *   - 有账号 → 长轮询 getupdates，把白名单用户的文本消息派给本地 Claude CLI，
 *     Claude 在 VAULT_PATH 里干活，结果切片回微信
 */
import { config, assertConfig } from "./config.js";
import { login, loadAccount } from "./login.js";
import { pollUpdates } from "./poll.js";
import { sendText, extractText } from "./reply.js";
import {
  cancelClaude,
  getClaudeTaskStatus,
  resetSession,
  runClaude,
} from "./claude-runner.js";
import { helpText, parseBotCommand } from "./bot-commands.js";

const WECHAT_CHUNK = 3500; // 单条文本上限保守值

function splitForWechat(s: string, n: number = WECHAT_CHUNK): string[] {
  if (s.length <= n) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

async function main(): Promise<void> {
  console.log("================ weixin-claude-bot ================");
  assertConfig();

  let account = loadAccount();
  if (!account) {
    console.log("未检测到账号，先扫码登录...\n");
    account = await login();
    console.log("\n下一步：");
    console.log(`  1. 把 userId 写到 .env 的 WHITELIST_USER_IDS:`);
    console.log(`       WHITELIST_USER_IDS="${account.userId}"`);
    console.log("  2. 重新运行 npm start，bot 进入回声模式\n");
    return;
  }

  console.log(`✓ 账号已加载  userId=${account.userId}`);
  console.log(`✓ baseUrl     ${account.baseUrl}`);
  if (config.whitelistUserIds.length === 0) {
    console.error("\n⚠️  WHITELIST_USER_IDS 为空，bot 不会启动。");
    console.error("请先把自己的 userId 写入 .env，例如：");
    console.error(`  WHITELIST_USER_IDS="${account.userId}"\n`);
    return;
  }
  console.log(`✓ 白名单      ${config.whitelistUserIds.join(", ")}`);
  console.log(`✓ 仓库路径    ${config.vaultPath}`);
  console.log("\n→ 长轮询启动，给手机 'AI Bot' 发一句话试试 ...\n");

  for await (const msg of pollUpdates(account.baseUrl, account.botToken)) {
    const from = msg.from_user_id;
    const ctx = msg.context_token ?? "";
    const text = extractText(msg);

    if (!ctx) {
      console.log(`[skip] 无 context_token (msg_type=${msg.message_type})`);
      continue;
    }
    if (
      config.whitelistUserIds.length > 0 &&
      !config.whitelistUserIds.includes(from)
    ) {
      console.log(`[skip] 非白名单: ${from}`);
      continue;
    }
    if (!text) {
      console.log(`[skip] 非文本/语音 (item_type=${msg.item_list?.[0]?.type})`);
      continue;
    }

    console.log(`[recv] ${from}: ${text}`);

    const command = parseBotCommand(text);
    if (command) {
      let reply: string;
      if (command.type === "stop") {
        reply = cancelClaude(from) ? "已中断当前任务。" : "当前没有正在执行的任务。";
      } else if (command.type === "status") {
        reply = getClaudeTaskStatus(from);
      } else if (command.type === "reset") {
        resetSession(from);
        reply = "已清除当前 Claude 会话。";
      } else {
        reply = helpText();
      }
      try {
        await sendText(account.baseUrl, account.botToken, from, reply, ctx);
      } catch (e: unknown) {
        console.error(`[send] 命令回复失败: ${e instanceof Error ? e.message : e}`);
      }
      continue;
    }

    if (getClaudeTaskStatus(from) !== "当前没有正在执行的任务。") {
      try {
        await sendText(
          account.baseUrl,
          account.botToken,
          from,
          "当前任务正在执行，请发送 /status 查看状态，或发送 /stop 中断。",
          ctx,
        );
      } catch (e: unknown) {
        console.error(`[send] 忙碌提示失败: ${e instanceof Error ? e.message : e}`);
      }
      continue;
    }

    // 1. 立即回执，避免用户长时间等待无反馈
    try {
      await sendText(account.baseUrl, account.botToken, from, "🤔 收到，正在处理...", ctx);
    } catch (e: unknown) {
      console.error(`[send] 回执失败: ${e instanceof Error ? e.message : e}`);
    }

    void (async () => {
      // 2. 调 Claude（最多 180s）
      const t0 = Date.now();
      let result: string;
      try {
        result = await runClaude(text, from);
      } catch (e: unknown) {
        result = `[runClaude 异常] ${e instanceof Error ? e.message : String(e)}`;
      }
      const elapsed = Math.round((Date.now() - t0) / 1000);
      console.log(`[claude] ${elapsed}s, ${result.length} chars`);

      // 3. 切片回复
      const chunks = splitForWechat(result);
      for (let i = 0; i < chunks.length; i++) {
        const piece =
          chunks.length > 1 ? `(${i + 1}/${chunks.length})\n${chunks[i]}` : chunks[i]!;
        try {
          await sendText(account.baseUrl, account.botToken, from, piece, ctx);
        } catch (e: unknown) {
          console.error(`[send] 第 ${i + 1} 片失败: ${e instanceof Error ? e.message : e}`);
          break;
        }
      }
      console.log(`[send] → ${chunks.length} 片回复完毕`);
    })();
  }
}

main().catch((e: unknown) => {
  console.error("\n❌ 失败:", e instanceof Error ? e.message : e);
  process.exit(1);
});
