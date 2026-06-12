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
