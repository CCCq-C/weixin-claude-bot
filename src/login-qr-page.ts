import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import QRCode from "qrcode";

export type LoginQrPage = {
  filePath: string;
  fileUrl: string;
};

export type OpenBrowserCommand = {
  command: string;
  args: string[];
};

export async function createLoginQrPage(
  qrContent: string,
  outputDir = "data",
): Promise<LoginQrPage> {
  fs.mkdirSync(outputDir, { recursive: true });

  const qrDataUrl = await QRCode.toDataURL(qrContent, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });

  const filePath = path.resolve(outputDir, "login-qrcode.html");
  fs.writeFileSync(filePath, renderLoginQrPageHtml(qrDataUrl), "utf-8");

  return {
    filePath,
    fileUrl: pathToFileURL(filePath).toString(),
  };
}

export function renderLoginQrPageHtml(qrDataUrl: string, title = "微信扫码登录"): string {
  const safeTitle = escapeHtml(title);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f6f7f8;
      color: #1f2328;
    }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      box-sizing: border-box;
    }
    main {
      width: min(420px, 100%);
      text-align: center;
      background: #ffffff;
      border: 1px solid #d8dee4;
      border-radius: 8px;
      padding: 28px 24px;
      box-sizing: border-box;
      box-shadow: 0 12px 36px rgba(31, 35, 40, 0.08);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      line-height: 1.3;
    }
    p {
      margin: 0 0 20px;
      color: #57606a;
      line-height: 1.7;
      font-size: 15px;
    }
    img {
      width: min(320px, 100%);
      height: auto;
      border: 1px solid #d8dee4;
      border-radius: 8px;
      background: #fff;
    }
    .hint {
      margin-top: 18px;
      margin-bottom: 0;
      font-size: 13px;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        background: #0d1117;
        color: #f0f6fc;
      }
      main {
        background: #161b22;
        border-color: #30363d;
        box-shadow: none;
      }
      p {
        color: #8b949e;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    <p>请用手机微信扫描下方二维码，并在手机端确认登录。</p>
    <img src="${qrDataUrl}" alt="微信扫码登录二维码">
    <p class="hint">登录窗口有效期约 5 分钟。登录成功后可以关闭本页。</p>
  </main>
</body>
</html>
`;
}

export function buildOpenBrowserCommand(
  platform: NodeJS.Platform,
  targetUrl: string,
): OpenBrowserCommand {
  if (platform === "darwin") return { command: "open", args: [targetUrl] };
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", targetUrl] };
  return { command: "xdg-open", args: [targetUrl] };
}

export function openLoginQrPage(
  targetUrl: string,
  spawnFn: typeof spawn = spawn,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const { command, args } = buildOpenBrowserCommand(platform, targetUrl);
  const child = spawnFn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return true;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
