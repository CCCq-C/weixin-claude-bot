/**
 * 发送文本消息回 ilinkai/bot/sendmessage。
 * 协议参考：02-协议拆解笔记.md §5 发送 + §6 context_token
 *
 * 关键：context_token 必须 echo 入站消息的原值，否则可能发不出去。
 */
import crypto from "node:crypto";
import { postSigned, BASE_INFO } from "./api.js";
import type { WeixinMessage } from "./poll.js";

type SendResp = { ret?: number; errCode?: number; errMsg?: string };

export async function sendText(
  baseUrl: string,
  botToken: string,
  toUserId: string,
  text: string,
  contextToken: string,
): Promise<void> {
  const r = await postSigned<SendResp>(
    baseUrl,
    botToken,
    "/ilink/bot/sendmessage",
    {
      msg: {
        from_user_id: "",
        to_user_id: toUserId,
        client_id: crypto.randomUUID(),
        message_type: 2, // BOT
        message_state: 2, // FINISH
        item_list: [{ type: 1, text_item: { text } }],
        context_token: contextToken,
      },
      base_info: BASE_INFO,
    },
  );
  // 服务端约定：明确 ret !== 0 才算错；ret 缺失视为成功（npm 包根本不检查响应）
  if (typeof r.ret === "number" && r.ret !== 0) {
    throw new Error(`sendmessage ret=${r.ret} ${r.errMsg ?? ""}`);
  }
}

/** 从入站消息里抽取纯文本（含语音转文字）；非文本/语音返回 null */
export function extractText(msg: WeixinMessage): string | null {
  for (const item of msg.item_list ?? []) {
    if (item.type === 1 && item.text_item?.text) return item.text_item.text;
    if (item.type === 3 && item.voice_item?.text) return item.voice_item.text;
  }
  return null;
}
