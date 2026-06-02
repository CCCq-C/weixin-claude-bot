/**
 * ilinkai HTTP 工具：所有带 botToken 的 POST 经这里走。
 * 协议参考：02-协议拆解笔记.md §3 Headers
 */
import crypto from "node:crypto";

const APP_ID = "bot";
const CLIENT_VERSION = "66049";
export const CHANNEL_VERSION = "2.4.1";
// 服务端期望 bot_agent 字段；默认沿用 npm 包里的 "OpenClaw"
// （改成自定义字符串未验证，先保守对齐）
export const BASE_INFO = { channel_version: CHANNEL_VERSION, bot_agent: "OpenClaw" };

/** X-WECHAT-UIN：每次随机 uint32 → 字符串 → base64 */
function genXWechatUin(): string {
  const u32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(u32), "utf-8").toString("base64");
}

export async function postSigned<T>(
  baseUrl: string,
  botToken: string,
  pathname: string,
  body: object,
  signal?: AbortSignal,
): Promise<T> {
  // 跟 npm 包对齐：base 强制 trailing slash，endpoint 去掉 leading slash 后用 URL 拼接
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(pathname.replace(/^\//, ""), base).toString();
  const payload = JSON.stringify(body);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(payload, "utf-8")),
      "iLink-App-Id": APP_ID,
      "iLink-App-ClientVersion": CLIENT_VERSION,
      AuthorizationType: "ilink_bot_token",
      Authorization: `Bearer ${botToken}`,
      "X-WECHAT-UIN": genXWechatUin(),
    },
    body: payload,
    signal,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${pathname} ${res.status}: ${txt}`);
  }
  const txt = await res.text();
  if (process.env.DEBUG_API) {
    console.error(`[api] POST ${pathname} ← ${txt.slice(0, 500)}`);
  }
  try {
    return JSON.parse(txt) as T;
  } catch {
    throw new Error(`POST ${pathname} 返回非 JSON: ${txt.slice(0, 300)}`);
  }
}
