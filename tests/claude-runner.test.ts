import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { isInterruptedExit } from "../src/claude-runner.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("treats normal cancellation exit codes as interrupted tasks", () => {
  assert.equal(isInterruptedExit(null), true);
  assert.equal(isInterruptedExit(130), true);
  assert.equal(isInterruptedExit(143), true);
  assert.equal(isInterruptedExit(1), false);
});

test("Windows hidden Claude runner pipes the prompt file into claude -p", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "src", "claude-runner.ts"),
    "utf-8",
  );

  assert.match(source, /promptPath/);
  assert.match(source, /\$prompt\s*\|\s*&\s*\$payload\.command/);
  assert.doesNotMatch(source, /\$null\s*\|\s*&/);
});
