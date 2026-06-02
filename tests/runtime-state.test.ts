import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendEvent,
  readStatus,
  updateStatus,
} from "../src/runtime-state.js";

test("writes and merges runtime status without leaking tokens", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-state-"));

  updateStatus(dir, {
    wechatAccountLoaded: true,
    botToken: "secret-token",
    vaultPath: "/tmp/vault",
  });
  updateStatus(dir, {
    whitelistConfigured: true,
    lastMessageAt: "2026-06-03T00:00:00.000Z",
  });

  const status = readStatus(dir);
  assert.equal(status.wechatAccountLoaded, true);
  assert.equal(status.whitelistConfigured, true);
  assert.equal(status.vaultPath, "/tmp/vault");
  assert.equal(status.lastMessageAt, "2026-06-03T00:00:00.000Z");
  assert.equal("botToken" in status, false);

  const raw = fs.readFileSync(path.join(dir, "status.json"), "utf-8");
  assert.equal(raw.includes("secret-token"), false);
});

test("appends JSONL events without leaking token fields", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-events-"));

  appendEvent(dir, "message-received", {
    from: "user@im.wechat",
    botToken: "secret-token",
  });
  appendEvent(dir, "task-finished", { ok: true });

  const raw = fs.readFileSync(path.join(dir, "events.log"), "utf-8");
  const lines = raw.trim().split("\n").map((line) => JSON.parse(line));

  assert.equal(lines.length, 2);
  assert.equal(lines[0].type, "message-received");
  assert.equal(lines[0].from, "user@im.wechat");
  assert.equal("botToken" in lines[0], false);
  assert.equal(raw.includes("secret-token"), false);
});
