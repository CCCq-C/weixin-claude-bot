import test from "node:test";
import assert from "node:assert/strict";
import { parseBotCommand } from "../src/bot-commands.js";

test("parses stop command aliases", () => {
  for (const text of ["/stop", "/cancel", "/中断", "/停止", " /stop "]) {
    assert.deepEqual(parseBotCommand(text), { type: "stop" });
  }
});

test("parses status help and reset commands", () => {
  assert.deepEqual(parseBotCommand("/status"), { type: "status" });
  assert.deepEqual(parseBotCommand("/help"), { type: "help" });
  assert.deepEqual(parseBotCommand("/reset"), { type: "reset" });
});

test("ignores normal user prompts", () => {
  assert.equal(parseBotCommand("帮我总结今天的笔记"), null);
  assert.equal(parseBotCommand("/unknown"), null);
});
