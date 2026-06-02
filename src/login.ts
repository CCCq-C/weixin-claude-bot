/**
 * 微信扫码登录 ilinkai (协议见 02-协议拆解笔记.md)
 *
 * 流程：
 *   1. GET /ilink/bot/get_bot_qrcode  → 拿 qrcode + qrcode_img_content
 *   2. 生成本地浏览器扫码页 + 终端打印 ASCII 二维码
 *   3. LOOP: GET /ilink/bot/get_qrcode_status (长轮询)
 *      - "wait"               → 继续轮询
 *      - "scaned"             → 已扫，等用户在手机上点确认
 *      - "scaned_but_redirect"→ 切换 baseUrl 重新轮询
 *      - "confirmed"          → 拿到 botToken，写 data/account.json
 *      - "expired"            → 二维码过期
 */
import fs from "node:fs";
import path from "node:path";
import qrcode from "qrcode-terminal";
import { createLoginQrPage, openLoginQrPage } from "./login-qr-page.js";

const BASE_URL = "https://ilinkai.weixin.qq.com";
const APP_ID = "bot";
// version 编码：major<<16 | minor<<8 | patch；与 npm 包当前版本对齐
const CLIENT_VERSION = "66049";
const ACCOUNT_PATH = path.resolve("data/account.json");
const LOGIN_TIMEOUT_MS = 5 * 60_000; // 5 分钟
const POLL_TIMEOUT_MS = 35_000;

const COMMON_HEADERS: Record<string, string> = {
  "iLink-App-Id": APP_ID,
  "iLink-App-ClientVersion": CLIENT_VERSION,
};

export type Account = {
  botToken: string;
  userId: string;
  baseUrl: string;
  loggedInAt: string;
};

type QRCodeResp = {
  qrcode: string;
  qrcode_img_content: string;
  ret?: number;
};

type StatusResp = {
  status: "wait" | "scaned" | "confirmed" | "expired" | "scaned_but_redirect";
  bot_token?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
  baseurl?: string;
  redirect_host?: string;
};

async function fetchQRCode(): Promise<QRCodeResp> {
  const url = `${BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`;
  const res = await fetch(url, { headers: COMMON_HEADERS });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`get_bot_qrcode 失败: ${res.status} ${body}`);
  }
  return (await res.json()) as QRCodeResp;
}

async function pollStatus(qrcodeToken: string, baseUrl: string): Promise<StatusResp> {
  const url = `${baseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcodeToken)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), POLL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: COMMON_HEADERS, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`get_qrcode_status: ${res.status}`);
    return (await res.json()) as StatusResp;
  } catch (e: unknown) {
    clearTimeout(timer);
    // 长轮询客户端超时是正常情况，等同于 wait
    if (e instanceof Error && e.name === "AbortError") return { status: "wait" };
    // 网络抖动也当 wait 重试
    console.error(`[poll] 网络错误，重试中: ${String(e)}`);
    return { status: "wait" };
  }
}

export function loadAccount(): Account | null {
  if (!fs.existsSync(ACCOUNT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(ACCOUNT_PATH, "utf-8")) as Account;
  } catch {
    return null;
  }
}

function saveAccount(account: Account): void {
  fs.mkdirSync(path.dirname(ACCOUNT_PATH), { recursive: true });
  fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(account, null, 2), "utf-8");
}

export async function login(): Promise<Account> {
  console.log("→ 正在向 ilinkai 申请二维码 ...");
  const qr = await fetchQRCode();
  const qrPage = await createLoginQrPage(qr.qrcode_img_content);

  console.log("\n┌──────────────────────────────────────────────────────");
  console.log("│ 请用手机微信扫描浏览器中的二维码：");
  console.log(`│   ${qrPage.fileUrl}`);
  console.log("│ 已尝试自动打开浏览器；如果没弹出，请手动点击上面的链接。");
  console.log("└──────────────────────────────────────────────────────\n");

  try {
    openLoginQrPage(qrPage.fileUrl);
  } catch (e: unknown) {
    console.log(`浏览器自动打开失败，请手动打开上面的链接：${String(e)}`);
  }

  // 终端绘制 QR，给普通终端用户保留兜底入口。
  qrcode.generate(qr.qrcode_img_content, { small: true });

  console.log("\n等待扫码 + 手机确认（最多 5 分钟）...");

  let baseUrl = BASE_URL;
  let scannedNotice = false;
  const start = Date.now();

  while (Date.now() - start < LOGIN_TIMEOUT_MS) {
    const r = await pollStatus(qr.qrcode, baseUrl);

    if (r.status === "wait") {
      // 静默继续轮询
      continue;
    }

    if (r.status === "scaned") {
      if (!scannedNotice) {
        console.log("✅ 已扫描，请在手机上点击「确认」...");
        scannedNotice = true;
      }
      continue;
    }

    if (r.status === "scaned_but_redirect" && r.redirect_host) {
      const next = r.redirect_host.startsWith("http")
        ? r.redirect_host
        : `https://${r.redirect_host}`;
      console.log(`↪️ 切换接入点到 ${next}`);
      baseUrl = next;
      continue;
    }

    if (r.status === "confirmed") {
      if (!r.bot_token || !r.ilink_user_id) {
        throw new Error(
          `confirmed 但缺字段: bot_token=${!!r.bot_token} userId=${!!r.ilink_user_id}`,
        );
      }
      const account: Account = {
        botToken: r.bot_token,
        userId: r.ilink_user_id,
        baseUrl: r.baseurl ?? baseUrl,
        loggedInAt: new Date().toISOString(),
      };
      saveAccount(account);
      console.log("\n┌──────────────────────────────────────────────────────");
      console.log("│ 🎉 登录成功！");
      console.log(`│ userId: ${account.userId}`);
      console.log(`│ baseUrl: ${account.baseUrl}`);
      console.log(`│ 已保存到: ${ACCOUNT_PATH}`);
      console.log("└──────────────────────────────────────────────────────");
      return account;
    }

    if (r.status === "expired") {
      throw new Error("二维码已过期，请重新运行 `npm run login`");
    }
  }

  throw new Error("登录超时（5 分钟）");
}
