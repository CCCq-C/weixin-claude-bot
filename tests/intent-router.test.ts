import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAiIntentDecision,
  buildIntentRouterPrompt,
  parseAiIntentRouterOutput,
  resolveFileIntent,
  shouldAskAiRouter,
} from "../src/intent-router.js";
import { parseFileSendIntent } from "../src/file-intent.js";

test("AI normal_task decision overrides deterministic file-send false positives", async () => {
  const text =
    "帮我以金枪大叔的口吻，写3篇关于AI应用的口播文案，每篇300字左右。发给我，同时整理成WORD文档，存桌面的，存放在“智能体”这个文件夹";

  const intent = await resolveFileIntent(text, {
    classifyWithAi: async () => ({
      route: "normal_task",
      confidence: 0.93,
      reason: "create and save a new document",
    }),
  });

  assert.equal(intent, null);
});

test("AI send_existing_file decision can create a file-send intent", async () => {
  const intent = await resolveFileIntent("把刚才那个 plugin 文件发给我", {
    classifyWithAi: async () => ({
      route: "send_existing_file",
      confidence: 0.91,
      fileQuery: "plugin",
      fileTypes: ["json"],
    }),
  });

  assert.equal(intent?.kind, "send");
  assert.equal(intent?.query, "plugin");
});

test("low-confidence or failed AI decisions fall back to deterministic routing", async () => {
  const deterministic = parseFileSendIntent("把昨天那个报价表发我");

  assert.deepEqual(
    applyAiIntentDecision(
      "把昨天那个报价表发我",
      deterministic,
      { route: "normal_task", confidence: 0.2 },
    ),
    deterministic,
  );

  assert.deepEqual(
    await resolveFileIntent("把昨天那个报价表发我", {
      classifyWithAi: async () => {
        throw new Error("router unavailable");
      },
    }),
    deterministic,
  );
});

test("asks AI router for normal chat and fileish messages", () => {
  assert.equal(shouldAskAiRouter("今天心情怎么样？"), true);
  assert.equal(shouldAskAiRouter("/status"), false);
  assert.equal(shouldAskAiRouter("把桌面那个 Word 发给我"), true);
});

test("lets AI classify directory listing requests as normal Claude tasks", async () => {
  let called = false;
  assert.equal(shouldAskAiRouter("你好，看一下我桌面有啥文件夹"), true);

  const intent = await resolveFileIntent("你好，看一下我桌面有啥文件夹", {
    classifyWithAi: async () => {
      called = true;
      return {
        route: "normal_task",
        confidence: 0.95,
        reason: "user wants Claude to inspect/list a folder, not send an attachment",
      };
    },
  });

  assert.equal(called, true);
  assert.equal(intent, null);
});

test("parses Claude JSON wrapper and direct JSON router outputs", () => {
  assert.deepEqual(
    parseAiIntentRouterOutput(
      JSON.stringify({
        result: JSON.stringify({
          route: "send_existing_file",
          confidence: 0.88,
          file_query: "报价表",
          file_types: ["xlsx"],
          reason: "existing file request",
        }),
      }),
    ),
    {
      route: "send_existing_file",
      confidence: 0.88,
      fileQuery: "报价表",
      fileTypes: ["xlsx"],
      reason: "existing file request",
    },
  );

  assert.equal(parseAiIntentRouterOutput("not json"), null);
});

test("router prompt tells AI to keep create-and-save tasks as normal tasks", () => {
  const prompt = buildIntentRouterPrompt("看一下我桌面有啥文件夹");

  assert.match(prompt, /写、生成、创作、整理成 Word\/PPT\/PDF/);
  assert.match(prompt, /浏览目录|查看文件夹|打开文件夹/);
  assert.match(prompt, /normal_task/);
  assert.match(prompt, /send_existing_file/);
});
