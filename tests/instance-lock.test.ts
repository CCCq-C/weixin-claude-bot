import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { acquireInstanceLock } from "../src/instance-lock.js";

test("prevents two bot instances from using the same data directory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weixin-lock-"));
  const first = acquireInstanceLock(dir, { pid: 1234, isProcessAlive: () => true });
  const second = acquireInstanceLock(dir, { pid: 5678, isProcessAlive: () => true });

  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false);
  assert.match(second.message, /already running/i);

  first.release();
  const third = acquireInstanceLock(dir, { pid: 5678, isProcessAlive: () => true });
  assert.equal(third.acquired, true);
  third.release();
});

test("replaces a stale lock file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weixin-lock-stale-"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "bot.lock"),
    JSON.stringify({ pid: 999999, startedAt: "old" }),
    "utf-8",
  );

  const lock = acquireInstanceLock(dir, { pid: 1234, isProcessAlive: () => false });

  assert.equal(lock.acquired, true);
  assert.match(fs.readFileSync(path.join(dir, "bot.lock"), "utf-8"), /1234/);
  lock.release();
});
