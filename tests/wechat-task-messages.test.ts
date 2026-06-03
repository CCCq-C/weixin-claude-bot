import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskFinishedMessage,
  buildTaskStartedMessage,
} from "../src/wechat-task-messages.js";

test("task started message explains the visible workflow", () => {
  const message = buildTaskStartedMessage();

  assert.match(message, /收到/);
  assert.match(message, /处理流程/);
  assert.match(message, /调用 Claude Code/);
  assert.match(message, /分片发回微信/);
  assert.match(message, /\/status/);
});

test("task finished message closes the task with elapsed time", () => {
  const message = buildTaskFinishedMessage(37);

  assert.match(message, /本次处理已结束/);
  assert.match(message, /37 秒/);
  assert.match(message, /继续发下一条需求/);
});

test("task finished message warns when result delivery failed", () => {
  const message = buildTaskFinishedMessage(12, { resultDelivered: false });

  assert.match(message, /本次处理已结束/);
  assert.match(message, /12 秒/);
  assert.match(message, /结果发送过程中断/);
});
