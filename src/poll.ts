/**
 * 长轮询 ilinkai/bot/getupdates。
 * 协议参考：02-协议拆解笔记.md §5 接收
 *
 * 设计：
 *   - get_updates_buf 是位移游标（类似 Telegram 的 update_id）
 *   - 首次为空字符串，之后每次回传上次拿到的值
 *   - 服务端长轮询最多 ~35s，超时重发即可
 *   - 网络抖动不该把进程拖死，错误就退避 3s 继续
 */
import { postSigned, BASE_INFO } from "./api.js";
import {
  AuthExpiredError,
  isAuthExpiredError,
  isAuthExpiredPayload,
  reloginHint,
} from "./auth-errors.js";

export type WeixinMessageItem = {
  type: number; // 1=TEXT, 2=IMAGE, 3=VOICE, 4=FILE, 5=VIDEO
  text_item?: { text: string };
  voice_item?: { text?: string }; // 腾讯已做语音转文字
};

export type WeixinMessage = {
  from_user_id: string;
  to_user_id: string;
  client_id?: string;
  context_token?: string;
  message_type: number;
  message_state?: number;
  item_list: WeixinMessageItem[];
};

type GetUpdatesResp = {
  ret?: number; // 服务端不一定带（成功带消息时常省略）
  msgs?: WeixinMessage[];
  get_updates_buf?: string;
};

type PollEvent = { type: "auth-expired"; message: string };

const RETRY_DELAY_MS = 3000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function* pollUpdates(
  baseUrl: string,
  botToken: string,
): AsyncGenerator<WeixinMessage> {
  let buf = "";
  while (true) {
    try {
      const r = await postSigned<GetUpdatesResp>(
        baseUrl,
        botToken,
        "/ilink/bot/getupdates",
        { get_updates_buf: buf, base_info: BASE_INFO },
      );
      // 服务端约定：明确 ret !== 0 才算错；ret 缺失或 ret === 0 都是成功
      if (typeof r.ret === "number" && r.ret !== 0) {
        if (isAuthExpiredPayload(r)) {
          console.error(`[poll] ${reloginHint()}`);
          return;
        }
        console.error(
          `[poll] 服务端 ret=${r.ret}，原始 body=${JSON.stringify(r).slice(0, 500)}`,
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      if (typeof r.get_updates_buf === "string") buf = r.get_updates_buf;
      if (r.msgs && r.msgs.length > 0) {
        for (const m of r.msgs) yield m;
      }
    } catch (e: unknown) {
      if (isAuthExpiredError(e)) {
        console.error(`[poll] ${reloginHint()}`);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[poll] 错误: ${msg}，${RETRY_DELAY_MS}ms 后重试`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

export async function collectPollEventsForTest(
  fetchOnce: () => Promise<unknown>,
): Promise<PollEvent[]> {
  try {
    await fetchOnce();
    return [];
  } catch (error) {
    if (isAuthExpiredError(error)) {
      return [{ type: "auth-expired", message: error.message }];
    }
    throw error;
  }
}
