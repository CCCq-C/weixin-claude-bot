import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskFinishedMessage,
  buildTaskStartedMessage,
} from "../src/wechat-task-messages.js";

test("task started message gives a concise receipt and command hints", () => {
  const message = buildTaskStartedMessage();

  assert.equal(
    message,
    "🫡收到～任务开始啦！\n可发送 /status 查看状态，或 /stop 中断。",
  );
});

test("task finished message closes the task with elapsed time", () => {
  const message = buildTaskFinishedMessage(37);

  assert.equal(message, "✅用时 37 秒，您可以说下一个任务啦！");
});

test("task finished message warns when result delivery failed", () => {
  const message = buildTaskFinishedMessage(12, { resultDelivered: false });

  assert.match(message, /本次处理已结束/);
  assert.match(message, /12 秒/);
  assert.match(message, /结果发送过程中断/);
});
