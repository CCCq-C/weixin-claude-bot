import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  isInterruptedExit,
  readTextFileIfExists,
} from "../src/claude-runner.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("treats normal cancellation exit codes as interrupted tasks", () => {
  assert.equal(isInterruptedExit(null), true);
  assert.equal(isInterruptedExit(130), true);
  assert.equal(isInterruptedExit(143), true);
  assert.equal(isInterruptedExit(1), false);
});

test("Windows hidden Claude runner passes the user prompt as a claude -p argument", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src", "claude-runner.ts"),
    "utf-8",
  );

  assert.match(source, /Get-Content.+payloadPath.+-Encoding UTF8/);
  assert.match(source, /Out-File.+-Encoding UTF8/);
  assert.match(source, /const args = \["-p", agentPrompt, \.\.\.claudeOptions\]/);
  assert.doesNotMatch(source, /promptPath/);
  assert.doesNotMatch(source, /\$prompt\s*\|\s*&\s*\$payload\.command/);
  assert.doesNotMatch(source, /1>\s*\$payload\.stdoutPath/);
  assert.doesNotMatch(source, /\$null\s*\|\s*&/);
});

test("reads Windows PowerShell UTF-16 redirected output without mojibake", () => {
  const dir = fs.mkdtempSync(path.join(repoRoot, "data", "test-utf16-"));
  const filePath = path.join(dir, "stdout.txt");
  fs.writeFileSync(filePath, Buffer.from("\uFEFF{\"result\":\"ok\"}", "utf16le"));

  assert.equal(readTextFileIfExists(filePath), '{"result":"ok"}');

  fs.rmSync(dir, { recursive: true, force: true });
});
