import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendConversationTurn,
  readConversationHistory,
  rootsFromConversationHistory,
} from "../src/conversation-history.js";
import { findLocalFileCandidates } from "../src/local-file-finder.js";

test("persists recent user and assistant turns with extracted file roots", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-conversation-"));
  const home = path.join(dir, "home");
  const obsidian = path.join(home, "Desktop", "obsidian-skills-main");
  const pluginDir = path.join(obsidian, ".claude-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });

  appendConversationTurn(
    dir,
    "user",
    { role: "user", content: "那个 obsidian 文件夹里面是啥" },
    { now: new Date("2026-06-14T10:00:00.000Z"), homeDir: home },
  );
  appendConversationTurn(
    dir,
    "user",
    {
      role: "assistant",
      content: [
        "桌面上没有叫 obsidian 的文件夹，你是说：",
        "1. `obsidian-skills-main/` — Obsidian 插件 skill 包",
      ].join("\n"),
    },
    { now: new Date("2026-06-14T10:00:01.000Z"), homeDir: home },
  );
  appendConversationTurn(
    dir,
    "user",
    { role: "user", content: "第一个" },
    { now: new Date("2026-06-14T10:00:02.000Z"), homeDir: home },
  );
  appendConversationTurn(
    dir,
    "user",
    {
      role: "assistant",
      content: [
        "`obsidian-skills-main/` 是一个 Obsidian Claude 插件包，内容：",
        "`skills/` — 5 个 skill",
        "`.claude-plugin/` — 插件配置（plugin.json + marketplace.json）",
      ].join("\n"),
    },
    { now: new Date("2026-06-14T10:00:03.000Z"), homeDir: home },
  );

  const history = readConversationHistory(
    dir,
    "user",
    new Date("2026-06-14T10:01:00.000Z"),
  );
  assert.equal(history?.turns.length, 4);
  assert.ok(rootsFromConversationHistory(history, "plugin").includes(pluginDir));
});

test("uses conversation roots to find contextual plugin files when file context is missing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcb-conversation-"));
  const home = path.join(dir, "home");
  const obsidian = path.join(home, "Desktop", "obsidian-skills-main");
  const pluginDir = path.join(obsidian, ".claude-plugin");
  const noisyDir = path.join(home, "Desktop", "CodeX", "ai-status-light", "target", "release", "deps");
  const expected = path.join(pluginDir, "plugin.json");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.mkdirSync(noisyDir, { recursive: true });
  fs.writeFileSync(expected, "{}");
  fs.writeFileSync(path.join(pluginDir, "marketplace.json"), "{}");
  fs.writeFileSync(path.join(noisyDir, "libtauri_plugin_opener.rlib"), "noise");

  appendConversationTurn(
    dir,
    "user",
    {
      role: "assistant",
      content: [
        "桌面上没有叫 obsidian 的文件夹，你是说：",
        "1. `obsidian-skills-main/` — Obsidian 插件 skill 包",
      ].join("\n"),
    },
    { now: new Date("2026-06-14T10:00:00.000Z"), homeDir: home },
  );
  appendConversationTurn(
    dir,
    "user",
    {
      role: "assistant",
      content: [
        "`obsidian-skills-main/` 是一个 Obsidian Claude 插件包，内容：",
        "`skills/` — 5 个 skill",
        "`.claude-plugin/` — 插件配置（plugin.json + marketplace.json）",
      ].join("\n"),
    },
    { now: new Date("2026-06-14T10:00:01.000Z"), homeDir: home },
  );

  const history = readConversationHistory(
    dir,
    "user",
    new Date("2026-06-14T10:01:00.000Z"),
  );
  const candidates = await findLocalFileCandidates(
    { kind: "send", query: "plugin", extensions: [] },
    {
      roots: rootsFromConversationHistory(history, "plugin"),
      now: new Date("2026-06-14T10:01:00.000Z"),
      preserveRootOrder: true,
    },
  );

  assert.equal(candidates[0].path, expected);
});
