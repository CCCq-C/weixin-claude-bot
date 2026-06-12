import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseFileSendIntent } from "../src/file-intent.js";
import { resolveFileQueryRoots } from "../src/file-query-roots.js";

test("resolves a named Desktop folder from the user query", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-home-"));
  const target = path.join(home, "Desktop", "project-alpha");
  const other = path.join(home, "Desktop", "project-beta");
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(other, { recursive: true });

  const roots = await resolveFileQueryRoots("把桌面上 project-alpha 这个文件夹里的 md 文件发我", {
    homeDir: home,
  });

  assert.deepEqual(roots, [target]);
});

test("resolves a named Downloads folder from the user query", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-home-"));
  const target = path.join(home, "Downloads", "invoice-pack");
  fs.mkdirSync(target, { recursive: true });

  const roots = await resolveFileQueryRoots("把下载里的 invoice-pack 目录里的 pdf 发我", {
    homeDir: home,
  });

  assert.deepEqual(roots, [target]);
});

test("resolves an absolute directory path from the user query", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-abs-"));

  const roots = await resolveFileQueryRoots(`把 ${root} 里面的 md 文件发我`);

  assert.deepEqual(roots, [root]);
});

test("resolves a named folder outside the common Desktop and Downloads roots", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-home-"));
  const target = path.join(home, "Projects", "client-kit");
  fs.mkdirSync(target, { recursive: true });

  const roots = await resolveFileQueryRoots("把 client-kit 这个文件夹里的 ppt 发我", {
    homeDir: home,
  });

  assert.deepEqual(roots, [target]);
});

test("resolves a Chinese folder name after natural language intent cleanup", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-home-"));
  const target = path.join(home, "Desktop", "微信驱动Claude方案");
  fs.mkdirSync(target, { recursive: true });

  const intent = parseFileSendIntent("把桌面上 微信驱动Claude方案 这个文件夹里的 md 文件发我");
  assert.ok(intent);

  const roots = await resolveFileQueryRoots(intent.query, { homeDir: home });

  assert.deepEqual(roots, [target]);
});

test("does not treat plain file names as folder roots", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-home-"));
  const falseRoot = path.join(home, "Desktop", "Claude", "AI");
  fs.mkdirSync(falseRoot, { recursive: true });

  const intent = parseFileSendIntent("AI小组作业收集.xlsx我要这个文件发给我");
  assert.ok(intent);

  const roots = await resolveFileQueryRoots(intent.query, { homeDir: home });

  assert.deepEqual(roots, []);
});
