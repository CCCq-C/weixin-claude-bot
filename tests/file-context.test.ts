import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  extractFileContextRoots,
  readFileContext,
  saveFileContextFromText,
  shouldUseFileContext,
} from "../src/file-context.js";
import { findLocalFileCandidates } from "../src/local-file-finder.js";

test("extracts shell and absolute path hints from Claude output", () => {
  const roots = extractFileContextRoots(
    [
      'PKG_DIR="$HOME/Desktop/douyin-skill-small-offline-package"',
      "/Users/me/Desktop/another-package/README.md",
    ].join("\n"),
    { homeDir: "/Users/me" },
  );

  assert.deepEqual(roots, [
    "/Users/me/Desktop/douyin-skill-small-offline-package",
    "/Users/me/Desktop/another-package",
  ]);
});

test("extracts desktop folder names from desktop-style listings", () => {
  const roots = extractFileContextRoots(
    [
      "桌面上一共有这些文件夹：",
      "- douyin-skill-small-offline-package/ — 抖音 Skill 离线包",
      "- markitdown/ — 工具项目",
    ].join("\n"),
    { homeDir: "/Users/me" },
  );

  assert.deepEqual(roots, [
    "/Users/me/Desktop/douyin-skill-small-offline-package",
    "/Users/me/Desktop/markitdown",
  ]);
});

test("extracts Chinese desktop folder names from Claude folder listings", () => {
  const roots = extractFileContextRoots(
    [
      "历史/ 文件夹内容：",
      "📁 子文件夹：",
      "① `AI:SKILL内容/` — AI Skill 相关",
      "② `GEO/` — 项目合同文件",
      "③ `排班02/` — 排班页面",
    ].join("\n"),
    { homeDir: "/Users/me" },
  );

  assert.deepEqual(roots, [
    "/Users/me/Desktop/历史",
    "/Users/me/Desktop/历史/AI:SKILL内容",
    "/Users/me/Desktop/历史/GEO",
    "/Users/me/Desktop/历史/排班02",
  ]);
});

test("extracts inline nested desktop folder paths from Claude summaries", () => {
  const roots = extractFileContextRoots(
    [
      "桌面上没有直接的 GEO 文件夹，历史/GEO/ 下面的完整结构：",
      "📄 根文件：",
      "• `程千子梳理1.docx` — Word 文档",
      "📁 `AVG/` — Avant-Garde 项目",
    ].join("\n"),
    { homeDir: "/Users/me" },
  );

  assert.deepEqual(roots, ["/Users/me/Desktop/历史/GEO", "/Users/me/Desktop/历史/GEO/AVG"]);
});

test("saves only existing directories and expires context", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-context-"));
  const home = path.join(dir, "home");
  const pkg = path.join(home, "Desktop", "douyin-skill-small-offline-package");
  fs.mkdirSync(pkg, { recursive: true });

  saveFileContextFromText(
    dir,
    "user",
    'PKG_DIR="$HOME/Desktop/douyin-skill-small-offline-package"',
    {
      homeDir: home,
      now: new Date("2026-06-12T10:00:00.000Z"),
    },
  );

  assert.deepEqual(
    readFileContext(dir, "user", new Date("2026-06-12T10:10:00.000Z"))?.roots,
    [pkg],
  );
  assert.equal(readFileContext(dir, "user", new Date("2026-06-12T11:01:00.000Z")), null);
});

test("updates context to a folder opened from the previous listing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-context-"));
  const home = path.join(dir, "home");
  const codex = path.join(home, "Desktop", "CodeX");
  const htmlDir = path.join(codex, "小黄Html");
  fs.mkdirSync(htmlDir, { recursive: true });

  saveFileContextFromText(
    dir,
    "user",
    [
      "`CodeX/` 文件夹内容：",
      "• `OpenMAIC/` — 38 个项目，看起来是核心项目",
      "• `小黄Html/` — 小黄相关 HTML",
    ].join("\n"),
    { homeDir: home, now: new Date("2026-06-12T10:00:00.000Z") },
  );
  saveFileContextFromText(
    dir,
    "user",
    ["小黄Html/ 里有 3 个文件：", "• `geo.html` — HTML 页面"].join("\n"),
    { homeDir: home, now: new Date("2026-06-12T10:01:00.000Z") },
  );

  assert.deepEqual(
    readFileContext(dir, "user", new Date("2026-06-12T10:02:00.000Z"))?.roots,
    [htmlDir],
  );
});

test("updates context when user opens an ordinal folder and Claude omits the path", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-context-"));
  const home = path.join(dir, "home");
  const codex = path.join(home, "Desktop", "CodeX");
  const first = path.join(codex, "OpenMAIC");
  const second = path.join(codex, "小黄Html");
  const third = path.join(codex, "排班02");
  fs.mkdirSync(first, { recursive: true });
  fs.mkdirSync(second, { recursive: true });
  fs.mkdirSync(third, { recursive: true });

  saveFileContextFromText(
    dir,
    "user",
    [
      "`CodeX/` 文件夹内容：",
      "• `OpenMAIC/` — 38 个项目，看起来是核心项目",
      "• `小黄Html/` — 小黄相关 HTML",
      "• `排班02/` — 排班页面",
    ].join("\n"),
    { homeDir: home, now: new Date("2026-06-12T10:00:00.000Z") },
  );
  saveFileContextFromText(
    dir,
    "user",
    "打开第二个\n已经在 Finder 里打开了。里面有什么需要我读的吗？",
    { homeDir: home, now: new Date("2026-06-12T10:01:00.000Z") },
  );

  assert.deepEqual(
    readFileContext(dir, "user", new Date("2026-06-12T10:02:00.000Z"))?.roots,
    [second],
  );
});

test("uses context only for contextual file requests", () => {
  assert.equal(shouldUseFileContext("这个包里面的 md 文件"), true);
  assert.equal(shouldUseFileContext("把文件发给我手机上"), true);
  assert.equal(shouldUseFileContext("ai小组作业收集 xlsx"), true);
  assert.equal(shouldUseFileContext("把桌面那个 PPT 发过来"), false);
});

test("searches markdown files inside the saved package context", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-context-"));
  const home = path.join(dir, "home");
  const pkg = path.join(home, "Desktop", "douyin-skill-small-offline-package");
  const skillDir = path.join(pkg, "skill");
  const other = path.join(home, "Desktop", "other-package");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.mkdirSync(other, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# douyin");
  fs.writeFileSync(path.join(other, "SKILL.md"), "# other");

  saveFileContextFromText(
    dir,
    "user",
    "桌面上一共有这些文件夹：\n- douyin-skill-small-offline-package/ — 抖音 Skill 离线包",
    { homeDir: home, now: new Date("2026-06-12T10:00:00.000Z") },
  );

  const context = readFileContext(dir, "user", new Date("2026-06-12T10:01:00.000Z"));
  const candidates = await findLocalFileCandidates(
    {
      kind: "send",
      query: "这个包里面的 md 文件",
      extensions: [".md", ".markdown"],
    },
    { roots: context?.roots ?? [], now: new Date("2026-06-12T10:01:00.000Z") },
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].path, path.join(skillDir, "SKILL.md"));
});

test("searches files inside an inline nested folder context", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-context-"));
  const home = path.join(dir, "home");
  const geo = path.join(home, "Desktop", "历史", "GEO");
  const file = path.join(geo, "程千子梳理1.docx");
  fs.mkdirSync(geo, { recursive: true });
  fs.writeFileSync(file, "docx");

  saveFileContextFromText(
    dir,
    "user",
    [
      "桌面上没有直接的 GEO 文件夹，历史/GEO/ 下面的完整结构：",
      "• `程千子梳理1.docx` — Word 文档",
    ].join("\n"),
    { homeDir: home, now: new Date("2026-06-12T10:00:00.000Z") },
  );

  const context = readFileContext(dir, "user", new Date("2026-06-12T10:01:00.000Z"));
  const candidates = await findLocalFileCandidates(
    {
      kind: "send",
      query: "程千子梳理",
      extensions: [".doc", ".docx"],
    },
    { roots: context?.roots ?? [], now: new Date("2026-06-12T10:01:00.000Z") },
  );

  assert.equal(candidates[0].path, file);
});

test("narrows context to dot-prefixed plugin folder from Claude structure output", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-context-"));
  const home = path.join(dir, "home");
  const desktop = path.join(home, "Desktop");
  const codex = path.join(desktop, "CodeX");
  const obsidian = path.join(desktop, "obsidian-skills-main");
  const pluginDir = path.join(obsidian, ".claude-plugin");
  const noisyDir = path.join(codex, "ai-status-light", "target", "release", "deps");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.mkdirSync(noisyDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, "plugin.json"), "{}");
  fs.writeFileSync(path.join(pluginDir, "marketplace.json"), "{}");
  fs.writeFileSync(path.join(noisyDir, "libtauri_plugin_opener.rlib"), "noise");

  saveFileContextFromText(
    dir,
    "user",
    [
      "跟之前差不多，文件夹列表：",
      "• `CodeX/` — CodeX 项目",
      "• `obsidian-skills-main/` — Obsidian skills",
    ].join("\n"),
    { homeDir: home, now: new Date("2026-06-12T10:00:00.000Z") },
  );
  saveFileContextFromText(
    dir,
    "user",
    [
      "那个 obsidian 文件夹里面是啥",
      "这是一个 Obsidian Claude 插件包，结构如下：",
      "`.claude-plugin/` — 插件配置",
      "• `plugin.json` + `marketplace.json`",
      "`skills/` — 5 个 Obsidian 相关 skill",
    ].join("\n"),
    { homeDir: home, now: new Date("2026-06-12T10:01:00.000Z") },
  );

  const context = readFileContext(dir, "user", new Date("2026-06-12T10:02:00.000Z"));
  assert.ok(context?.roots.includes(pluginDir));

  const candidates = await findLocalFileCandidates(
    { kind: "send", query: "plugin", extensions: [] },
    {
      roots: context?.roots ?? [],
      now: new Date("2026-06-12T10:02:00.000Z"),
      preserveRootOrder: true,
    },
  );

  assert.equal(candidates[0].path, path.join(pluginDir, "plugin.json"));
});
