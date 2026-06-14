import test from "node:test";
import assert from "node:assert/strict";

import {
  parseFileSendIntent,
  parseFileSelectionReply,
} from "../src/file-intent.js";

test("detects natural language requests to send a file", () => {
  const intent = parseFileSendIntent("把昨天那个报价表发我");

  assert.equal(intent?.kind, "send");
  assert.equal(intent.query, "昨天 报价表");
});

test("detects common spoken send-file variants", () => {
  const intent = parseFileSendIntent("发一下最近的合同 Word");

  assert.equal(intent?.kind, "send");
  assert.equal(intent.query, "合同 word");
  assert.deepEqual(intent.extensions, [".doc", ".docx"]);
});

test("keeps slash sendfile as a hidden debug entry", () => {
  const intent = parseFileSendIntent("/sendfile /Users/me/Desktop/demo.pdf");

  assert.equal(intent?.kind, "send");
  assert.equal(intent.query, "/Users/me/Desktop/demo.pdf");
  assert.deepEqual(intent.extensions, [".pdf"]);
});

test("does not treat document writing help as a file send request", () => {
  assert.equal(parseFileSendIntent("总结这个报价表怎么写"), null);
});

test("does not trap normal folder or task requests as file sending", () => {
  assert.equal(parseFileSendIntent("看一下这个文件夹里面有什么内容"), null);
  assert.equal(parseFileSendIntent("帮我执行一下刚才那个整理任务"), null);
});

test("does not treat create-and-save document tasks as file sending", () => {
  assert.equal(
    parseFileSendIntent(
      "帮我以金枪大叔的口吻，写3篇关于AI应用的口播文案，每篇300字左右。发给我，同时整理成WORD文档，存桌面的，存放在“智能体”这个文件夹",
    ),
    null,
  );
  assert.equal(parseFileSendIntent("请生成一份 Word 文档并保存到桌面"), null);
});

test("still treats existing document requests as file sending", () => {
  const intent = parseFileSendIntent("把桌面智能体文件夹里的 Word 文档发给我");

  assert.equal(intent?.kind, "send");
  assert.deepEqual(intent?.extensions, [".doc", ".docx"]);
});

test("detects search-only file requests and maps file type words", () => {
  const intent = parseFileSendIntent("找一下那个 PPT");

  assert.equal(intent?.kind, "search");
  assert.equal(intent.query, "ppt");
  assert.deepEqual(intent.extensions, [".ppt", ".pptx"]);
});

test("maps markdown file words to md extensions", () => {
  const intent = parseFileSendIntent("把这个包里面的 md 文件发给我");

  assert.equal(intent?.kind, "send");
  assert.deepEqual(intent.extensions, [".md", ".markdown"]);
});

test("treats want-file wording as a file send request", () => {
  const intent = parseFileSendIntent("我要抖音的那个转录skill包里的md文件");

  assert.equal(intent?.kind, "send");
  assert.deepEqual(intent.extensions, [".md", ".markdown"]);
});

test("treats named markdown requests as a file send request", () => {
  const intent = parseFileSendIntent("我要这个给AI看的安装和使用说明.md");

  assert.equal(intent?.kind, "send");
  assert.deepEqual(intent.extensions, [".md", ".markdown"]);
});

test("cleans spoken suffixes from exact file name requests", () => {
  const intent = parseFileSendIntent("AI小组作业收集.xlsx我要这个文件发给我");

  assert.equal(intent?.kind, "send");
  assert.equal(intent.query, "ai小组作业收集 xlsx");
  assert.deepEqual(intent.extensions, [".xls", ".xlsx"]);
});

test("maps html wording to html files", () => {
  const intent = parseFileSendIntent("帮我把这个 HTML 发给我");

  assert.equal(intent?.kind, "send");
  assert.equal(intent.query, "html");
  assert.deepEqual(intent.extensions, [".html", ".htm"]);
});

test("cleans ordinal and casual words from contextual file requests", () => {
  const intent = parseFileSendIntent("哦，帮我把第一个那个程千子梳理发给我");

  assert.equal(intent?.kind, "send");
  assert.equal(intent.query, "程千子梳理");
});

test("normalizes spoken nested folder file requests", () => {
  const intent = parseFileSendIntent("我下载里面有个 MAC 文件夹，里面有个 skill大全，发给我");

  assert.equal(intent?.kind, "send");
  assert.equal(intent.query, "下载 mac skill大全");
});

test("parses replies for pending file selection", () => {
  assert.deepEqual(parseFileSelectionReply("第 2 个"), { type: "select", index: 1 });
  assert.deepEqual(parseFileSelectionReply("第一个"), { type: "select", index: 0 });
  assert.deepEqual(parseFileSelectionReply("第二个"), { type: "select", index: 1 });
  assert.deepEqual(parseFileSelectionReply("确认"), { type: "confirm" });
  assert.deepEqual(parseFileSelectionReply("取消"), { type: "cancel" });
  assert.deepEqual(parseFileSelectionReply("别找了"), { type: "cancel" });
  assert.deepEqual(parseFileSelectionReply("不要找了"), { type: "cancel" });
  assert.deepEqual(parseFileSelectionReply("/stop"), { type: "cancel" });
});
