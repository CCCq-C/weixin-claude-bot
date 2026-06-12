import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  clearPendingFileSend,
  readPendingFileSend,
  savePendingFileSend,
} from "../src/pending-file-send.js";

const pending = {
  query: "报价表",
  candidates: [
    {
      path: "/Users/me/Desktop/报价表.xlsx",
      name: "报价表.xlsx",
      size: 1200,
      modifiedAt: new Date("2026-06-12T10:00:00.000Z"),
    },
  ],
  selectedIndex: 0,
  highRisk: false,
};

test("saves and reads pending file send state per user", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-pending-"));

  savePendingFileSend(dir, "user/one", pending, new Date("2026-06-12T10:01:00.000Z"));

  const saved = readPendingFileSend(dir, "user/one", new Date("2026-06-12T10:05:00.000Z"));
  assert.equal(saved?.query, "报价表");
  assert.equal(saved?.candidates[0].modifiedAt instanceof Date, true);
});

test("expires pending file send state after ten minutes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-pending-"));

  savePendingFileSend(dir, "user", pending, new Date("2026-06-12T10:00:00.000Z"));

  const expired = readPendingFileSend(dir, "user", new Date("2026-06-12T10:10:01.000Z"));
  assert.equal(expired, null);
});

test("clears pending file send state", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-pending-"));

  savePendingFileSend(dir, "user", pending, new Date("2026-06-12T10:00:00.000Z"));
  clearPendingFileSend(dir, "user");

  assert.equal(readPendingFileSend(dir, "user", new Date("2026-06-12T10:01:00.000Z")), null);
});
