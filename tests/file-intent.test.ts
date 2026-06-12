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

test("detects search-only file requests and maps file type words", () => {
  const intent = parseFileSendIntent("找一下那个 PPT");

  assert.equal(intent?.kind, "search");
  assert.equal(intent.query, "ppt");
  assert.deepEqual(intent.extensions, [".ppt", ".pptx"]);
});

test("parses replies for pending file selection", () => {
  assert.deepEqual(parseFileSelectionReply("第 2 个"), { type: "select", index: 1 });
  assert.deepEqual(parseFileSelectionReply("确认"), { type: "confirm" });
  assert.deepEqual(parseFileSelectionReply("取消"), { type: "cancel" });
  assert.deepEqual(parseFileSelectionReply("别找了"), { type: "cancel" });
  assert.deepEqual(parseFileSelectionReply("不要找了"), { type: "cancel" });
  assert.deepEqual(parseFileSelectionReply("/stop"), { type: "cancel" });
});
