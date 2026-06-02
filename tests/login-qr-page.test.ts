import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildOpenBrowserCommand,
  createLoginQrPage,
  renderLoginQrPageHtml,
} from "../src/login-qr-page.js";

test("creates a local browser page with an embedded QR image", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weixin-login-page-"));
  const page = await createLoginQrPage("https://example.com/login?token=temporary", dir);

  assert.equal(page.filePath, path.join(dir, "login-qrcode.html"));
  assert.match(page.fileUrl, /^file:\/\//);
  assert.equal(fs.existsSync(page.filePath), true);

  const html = fs.readFileSync(page.filePath, "utf-8");
  assert.match(html, /data:image\/png;base64,/);
  assert.match(html, /微信扫码登录/);
  assert.doesNotMatch(html, /temporary/);
});

test("escapes text rendered into the login QR page", () => {
  const html = renderLoginQrPageHtml("data:image/png;base64,abc", "a<b&c");

  assert.match(html, /a&lt;b&amp;c/);
  assert.doesNotMatch(html, /a<b&c/);
});

test("builds platform-specific browser open commands", () => {
  assert.deepEqual(buildOpenBrowserCommand("darwin", "file:///tmp/login.html"), {
    command: "open",
    args: ["file:///tmp/login.html"],
  });
  assert.deepEqual(buildOpenBrowserCommand("win32", "file:///C:/tmp/login.html"), {
    command: "cmd",
    args: ["/c", "start", "", "file:///C:/tmp/login.html"],
  });
  assert.deepEqual(buildOpenBrowserCommand("linux", "file:///tmp/login.html"), {
    command: "xdg-open",
    args: ["file:///tmp/login.html"],
  });
});
