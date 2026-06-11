import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ARCHIVED_REPLY_PREVIEW_LIMIT,
  prepareResultDelivery,
  RESULT_ARCHIVE_DIR,
} from "../src/result-delivery.js";

test("sends short Claude results directly without creating an archive", () => {
  const vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-vault-"));
  const prepared = prepareResultDelivery({
    vaultPath,
    userId: "user@im.wechat",
    result: "这是短回复",
    now: new Date("2026-06-11T12:00:00.000Z"),
  });

  assert.equal(prepared.archived, false);
  assert.deepEqual(prepared.messages, ["这是短回复"]);
  assert.equal(fs.existsSync(path.join(vaultPath, RESULT_ARCHIVE_DIR)), false);
});

test("archives long Claude results and returns a short WeChat-safe message", () => {
  const vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-vault-"));
  const longResult = "长内容".repeat(500);

  const prepared = prepareResultDelivery({
    vaultPath,
    userId: "user@im.wechat",
    result: longResult,
    now: new Date("2026-06-11T12:34:56.000Z"),
    directReplyLimit: 100,
  });

  assert.equal(prepared.archived, true);
  assert.ok(prepared.archivePath);
  assert.ok(prepared.relativeArchivePath);
  assert.match(prepared.relativeArchivePath, /^微信Bot回复归档\//);
  assert.match(prepared.messages[0]!, /结果比较长/);
  assert.match(prepared.messages[0]!, /微信里只发短预览/);
  assert.ok(prepared.messages[0]!.length < longResult.length);
  assert.equal(ARCHIVED_REPLY_PREVIEW_LIMIT, 1000);
  assert.ok(prepared.messages[0]!.length > 1000);

  const archived = fs.readFileSync(prepared.archivePath, "utf-8");
  assert.match(archived, /# 微信 Bot 回复归档/);
  assert.match(archived, /user@im\.wechat/);
  assert.match(archived, /长内容/);
});

test("empty Claude results produce a visible fallback message", () => {
  const vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-vault-"));
  const prepared = prepareResultDelivery({
    vaultPath,
    userId: "user@im.wechat",
    result: "   ",
  });

  assert.equal(prepared.archived, false);
  assert.match(prepared.messages[0]!, /没有返回/);
});
