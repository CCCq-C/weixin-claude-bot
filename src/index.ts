/**
 * 入口（M3 阶段）：
 *   - 没 data/account.json → 走扫码登录
 *   - 有账号 → 长轮询 getupdates，把白名单用户的文本消息派给本地 Claude CLI，
 *     Claude 在 VAULT_PATH 里干活，短结果回微信，长结果归档后回传路径
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
import { appendEvent, updateStatus } from "./runtime-state.js";
import {
  buildTaskFinishedMessage,
  buildTaskStartedMessage,
} from "./wechat-task-messages.js";
import { acquireInstanceLock } from "./instance-lock.js";
import { prepareResultDelivery } from "./result-delivery.js";
import {
  parseFileSelectionReply,
  parseFileSendIntent,
  type FileSendIntent,
} from "./file-intent.js";
import { findLocalFileCandidates } from "./local-file-finder.js";
import {
  buildCandidateReply,
  hasHighRiskCandidate,
  type FileCandidate,
} from "./file-search.js";
import {
  clearPendingFileSend,
  readPendingFileSend,
  savePendingFileSend,
  type PendingFileSend,
} from "./pending-file-send.js";
import { sendLocalFileAttachment } from "./weixin-media.js";
import {
  readFileContext,
  saveFileContextFromText,
  shouldUseFileContext,
} from "./file-context.js";

const WECHAT_CHUNK = 3500; // 单条文本上限保守值

function splitForWechat(s: string, n: number = WECHAT_CHUNK): string[] {
  if (s.length <= n) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

function saveFileCandidates(
  userId: string,
  query: string,
  candidates: FileCandidate[],
): PendingFileSend {
  const pending: PendingFileSend = {
    query,
    candidates,
    selectedIndex: candidates.length === 1 ? 0 : undefined,
    highRisk: hasHighRiskCandidate(candidates),
  };
  savePendingFileSend("data", userId, pending);
  return pending;
}

async function replyText(
  baseUrl: string,
  botToken: string,
  toUserId: string,
  text: string,
  contextToken: string,
): Promise<void> {
  try {
    await sendText(baseUrl, botToken, toUserId, text, contextToken);
  } catch (e: unknown) {
    console.error(`[send] 文件流程文本回复失败: ${e instanceof Error ? e.message : e}`);
  }
}

async function startFileSearch(params: {
  intent: FileSendIntent;
  userId: string;
  baseUrl: string;
  botToken: string;
  contextToken: string;
}): Promise<void> {
  const context = readFileContext("data", params.userId);
  let candidates: FileCandidate[] = [];

  if (context?.roots.length && shouldUseFileContext(params.intent.query)) {
    candidates = await findLocalFileCandidates(params.intent, {
      roots: context.roots,
      timeoutMs: 5000,
      maxScanned: 10_000,
    });
  }
  if (candidates.length === 0) {
    candidates = await findLocalFileCandidates(params.intent);
  }
  if (candidates.length === 0) {
    await replyText(
      params.baseUrl,
      params.botToken,
      params.userId,
      buildCandidateReply([], { query: params.intent.query, highRisk: false }),
      params.contextToken,
    );
    return;
  }

  const pending = saveFileCandidates(params.userId, params.intent.query, candidates);
  await replyText(
    params.baseUrl,
    params.botToken,
    params.userId,
    buildCandidateReply(candidates, {
      query: params.intent.query,
      highRisk: pending.highRisk,
    }),
    params.contextToken,
  );
}

async function sendConfirmedFile(params: {
  pending: PendingFileSend;
  index: number;
  userId: string;
  baseUrl: string;
  botToken: string;
  contextToken: string;
}): Promise<void> {
  const candidate = params.pending.candidates[params.index];
  if (!candidate) {
    await replyText(
      params.baseUrl,
      params.botToken,
      params.userId,
      "这个序号不在候选列表里，请重新回复候选序号，或回复“取消”。",
      params.contextToken,
    );
    return;
  }

  await replyText(
    params.baseUrl,
    params.botToken,
    params.userId,
    `已确认，正在发送：${candidate.name}`,
    params.contextToken,
  );

  try {
    await sendLocalFileAttachment({
      baseUrl: params.baseUrl,
      botToken: params.botToken,
      toUserId: params.userId,
      filePath: candidate.path,
      contextToken: params.contextToken,
    });
    clearPendingFileSend("data", params.userId);
    await replyText(
      params.baseUrl,
      params.botToken,
      params.userId,
      "发送完成。",
      params.contextToken,
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    clearPendingFileSend("data", params.userId);
    await replyText(
      params.baseUrl,
      params.botToken,
      params.userId,
      `附件发送失败：${message}`,
      params.contextToken,
    );
  }
}

async function main(): Promise<void> {
  console.log("================ weixin-claude-bot ================");
  assertConfig();

  const lock = acquireInstanceLock("data");
  if (!lock.acquired) {
    console.error(`\n❌ ${lock.message}`);
    console.error(`锁文件: ${lock.path}`);
    console.error("如果确认没有 bot 在运行，可以删除这个锁文件后再启动。");
    process.exit(1);
  }
  const releaseLock = (): void => lock.release();
  process.once("exit", releaseLock);
  process.once("SIGINT", () => {
    releaseLock();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    releaseLock();
    process.exit(143);
  });

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

  updateStatus("data", {
    wechatAccountLoaded: true,
    whitelistConfigured: config.whitelistUserIds.length > 0,
    vaultPath: config.vaultPath,
    claudeCommand: config.claudeCommand,
    currentTask: "idle",
  });
  appendEvent("data", "bot-started", {
    userId: account.userId,
    vaultPath: config.vaultPath,
  });

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
      appendEvent("data", "message-skipped", { from, reason: "not-whitelisted" });
      continue;
    }
    if (!text) {
      console.log(`[skip] 非文本/语音 (item_type=${msg.item_list?.[0]?.type})`);
      appendEvent("data", "message-skipped", { from, reason: "unsupported-message" });
      continue;
    }

    console.log(`[recv] ${from}: ${text}`);
    updateStatus("data", { lastMessageAt: new Date().toISOString() });
    appendEvent("data", "message-received", { from });

    const pendingFileSend = readPendingFileSend("data", from);
    if (pendingFileSend) {
      const selection = parseFileSelectionReply(text);
      if (selection?.type === "cancel") {
        clearPendingFileSend("data", from);
        await replyText(account.baseUrl, account.botToken, from, "已取消文件发送。", ctx);
        appendEvent("data", "file-send-cancelled", { from });
        continue;
      }
      if (selection?.type === "select") {
        const candidate = pendingFileSend.candidates[selection.index];
        if (!candidate) {
          await replyText(
            account.baseUrl,
            account.botToken,
            from,
            "这个序号不在候选列表里，请重新回复候选序号，或回复“取消”。",
            ctx,
          );
          continue;
        }
        if (pendingFileSend.highRisk) {
          const nextPending: PendingFileSend = {
            query: pendingFileSend.query,
            candidates: [candidate],
            selectedIndex: 0,
            highRisk: true,
          };
          savePendingFileSend("data", from, nextPending);
          await replyText(
            account.baseUrl,
            account.botToken,
            from,
            `你选择的是敏感文件：${candidate.name}\n请再次回复“确认”后发送，或回复“取消”。`,
            ctx,
          );
          continue;
        }
        await sendConfirmedFile({
          pending: pendingFileSend,
          index: selection.index,
          userId: from,
          baseUrl: account.baseUrl,
          botToken: account.botToken,
          contextToken: ctx,
        });
        appendEvent("data", "file-send-confirmed", { from });
        continue;
      }
      if (selection?.type === "confirm") {
        const index =
          pendingFileSend.selectedIndex ??
          (pendingFileSend.candidates.length === 1 ? 0 : undefined);
        if (typeof index !== "number") {
          await replyText(
            account.baseUrl,
            account.botToken,
            from,
            "我还不能确定你要发哪一个，请回复候选序号，或补充关键词继续找。",
            ctx,
          );
          continue;
        }
        await sendConfirmedFile({
          pending: pendingFileSend,
          index,
          userId: from,
          baseUrl: account.baseUrl,
          botToken: account.botToken,
          contextToken: ctx,
        });
        appendEvent("data", "file-send-confirmed", { from });
        continue;
      }

      const parsedRefinement = parseFileSendIntent(text);
      if (parsedRefinement) {
        await startFileSearch({
          intent: parsedRefinement,
          userId: from,
          baseUrl: account.baseUrl,
          botToken: account.botToken,
          contextToken: ctx,
        });
        appendEvent("data", "file-send-refined", { from });
        continue;
      }

      clearPendingFileSend("data", from);
      appendEvent("data", "file-send-dismissed-by-new-message", { from });
    }

    const fileIntent = parseFileSendIntent(text);
    if (fileIntent) {
      await startFileSearch({
        intent: fileIntent,
        userId: from,
        baseUrl: account.baseUrl,
        botToken: account.botToken,
        contextToken: ctx,
      });
      appendEvent("data", "file-send-search-started", { from });
      continue;
    }

    const command = parseBotCommand(text);
    if (command) {
      let reply: string;
      if (command.type === "stop") {
        reply = cancelClaude(from) ? "已中断当前任务。" : "当前没有正在执行的任务。";
        appendEvent("data", "command-stop", { from, reply });
      } else if (command.type === "status") {
        reply = getClaudeTaskStatus(from);
        appendEvent("data", "command-status", { from });
      } else if (command.type === "reset") {
        resetSession(from);
        reply = "已清除当前 Claude 会话。";
        appendEvent("data", "command-reset", { from });
      } else {
        reply = helpText();
        appendEvent("data", "command-help", { from });
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
      await sendText(account.baseUrl, account.botToken, from, buildTaskStartedMessage(), ctx);
    } catch (e: unknown) {
      console.error(`[send] 回执失败: ${e instanceof Error ? e.message : e}`);
    }

    void (async () => {
      updateStatus("data", { currentTask: "running" });
      appendEvent("data", "task-started", { from });
      // 2. 调 Claude（最多 180s）
      const t0 = Date.now();
      let result: string;
      try {
        result = await runClaude(text, from);
      } catch (e: unknown) {
        result = `[runClaude 异常] ${e instanceof Error ? e.message : String(e)}`;
        updateStatus("data", {
          lastError: e instanceof Error ? e.message : String(e),
        });
      }
      const elapsed = Math.round((Date.now() - t0) / 1000);
      console.log(`[claude] ${elapsed}s, ${result.length} chars`);
      saveFileContextFromText("data", from, `${text}\n${result}`);

      let resultDelivered = true;
      let chunks: string[];
      try {
        const delivery = prepareResultDelivery({
          vaultPath: config.vaultPath,
          userId: from,
          result,
        });
        chunks = delivery.messages.flatMap((message) => splitForWechat(message));
        if (delivery.archived) {
          appendEvent("data", "task-result-archived", {
            from,
            relativeArchivePath: delivery.relativeArchivePath,
          });
        }
      } catch (e: unknown) {
        resultDelivered = false;
        chunks = ["结果生成完成，但写入仓库归档失败，请查看终端日志。"];
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error(`[delivery] 结果交付准备失败: ${errorMessage}`);
        updateStatus("data", { lastError: errorMessage });
      }

      // 3. 切片回复
      let deliveredChunks = 0;
      for (let i = 0; i < chunks.length; i++) {
        const piece =
          chunks.length > 1 ? `(${i + 1}/${chunks.length})\n${chunks[i]}` : chunks[i]!;
        try {
          await sendText(account.baseUrl, account.botToken, from, piece, ctx);
          deliveredChunks += 1;
        } catch (e: unknown) {
          console.error(`[send] 第 ${i + 1} 片失败: ${e instanceof Error ? e.message : e}`);
          resultDelivered = false;
          break;
        }
      }
      try {
        await sendText(
          account.baseUrl,
          account.botToken,
          from,
          buildTaskFinishedMessage(elapsed, { resultDelivered }),
          ctx,
        );
      } catch (e: unknown) {
        console.error(`[send] 结束语失败: ${e instanceof Error ? e.message : e}`);
      }
      console.log(`[send] → ${deliveredChunks}/${chunks.length} 片回复完毕`);
      updateStatus("data", { currentTask: "idle" });
      appendEvent("data", "task-finished", { from, elapsedSeconds: elapsed });
    })();
  }
}

main().catch((e: unknown) => {
  console.error("\n❌ 失败:", e instanceof Error ? e.message : e);
  process.exit(1);
});
