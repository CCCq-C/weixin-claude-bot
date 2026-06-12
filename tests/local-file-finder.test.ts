import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { findLocalFileCandidates } from "../src/local-file-finder.js";

test("finds and ranks files from configured roots", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-files-"));
  const desktop = path.join(dir, "Desktop");
  const nested = path.join(dir, "Documents");
  fs.mkdirSync(desktop);
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(desktop, "客户报价表.xlsx"), "xlsx");
  fs.writeFileSync(path.join(nested, "报价说明.docx"), "docx");

  const candidates = await findLocalFileCandidates(
    { query: "报价表", extensions: [".xlsx"], kind: "send" },
    { roots: [dir], now: new Date("2026-06-12T12:00:00.000Z") },
  );

  assert.equal(candidates[0].name, "客户报价表.xlsx");
});

test("skips noisy directories while scanning", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-files-"));
  const noisy = path.join(dir, "node_modules");
  fs.mkdirSync(noisy);
  fs.writeFileSync(path.join(noisy, "报价表.xlsx"), "xlsx");

  const candidates = await findLocalFileCandidates(
    { query: "报价表", extensions: [".xlsx"], kind: "send" },
    { roots: [dir], now: new Date("2026-06-12T12:00:00.000Z") },
  );

  assert.equal(candidates.length, 0);
});

test("returns an absolute file path directly", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-files-"));
  const file = path.join(dir, "demo.pdf");
  fs.writeFileSync(file, "pdf");

  const candidates = await findLocalFileCandidates(
    { query: file, extensions: [".pdf"], kind: "send" },
    { roots: [path.join(dir, "missing")] },
  );

  assert.equal(candidates[0].path, file);
});
