import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentInput,
  CLAUDE_CODE_CAPABILITIES,
  TEXT_ONLY_CAPABILITIES,
} from "../src/agent-capabilities.js";

test("describes Claude Code as text plus local file capable", () => {
  assert.equal(CLAUDE_CODE_CAPABILITIES.text, true);
  assert.equal(CLAUDE_CODE_CAPABILITIES.fileRead, true);
});

test("describes text-only agents as unable to see images or read files", () => {
  assert.equal(TEXT_ONLY_CAPABILITIES.text, true);
  assert.equal(TEXT_ONLY_CAPABILITIES.vision, false);
  assert.equal(TEXT_ONLY_CAPABILITIES.fileRead, false);
});

test("uses extracted text for text-only agents when attachment has text", () => {
  const input = buildAgentInput({
    userText: "帮我总结",
    capabilities: TEXT_ONLY_CAPABILITIES,
    attachments: [
      {
        kind: "image",
        mime: "image/png",
        path: "inbox/image.png",
        extractedText: "图片里的文字",
      },
    ],
  });

  assert.match(input, /图片里的文字/);
  assert.doesNotMatch(input, /请直接读取附件/);
});

test("passes file paths to file-capable agents when extracted text is absent", () => {
  const input = buildAgentInput({
    userText: "看这个文件",
    capabilities: CLAUDE_CODE_CAPABILITIES,
    attachments: [
      {
        kind: "file",
        mime: "application/pdf",
        path: "inbox/report.pdf",
      },
    ],
  });

  assert.match(input, /inbox\/report\.pdf/);
  assert.match(input, /请直接读取附件/);
});

test("falls back safely when agent cannot process attachment", () => {
  const input = buildAgentInput({
    userText: "看这个文件",
    capabilities: TEXT_ONLY_CAPABILITIES,
    attachments: [
      {
        kind: "video",
        mime: "video/mp4",
        path: "inbox/video.mp4",
      },
    ],
  });

  assert.match(input, /当前 Agent 无法直接解析/);
});
