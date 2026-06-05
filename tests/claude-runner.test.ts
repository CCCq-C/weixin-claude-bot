import test from "node:test";
import assert from "node:assert/strict";

import { isInterruptedExit } from "../src/claude-runner.js";

test("treats normal cancellation exit codes as interrupted tasks", () => {
  assert.equal(isInterruptedExit(null), true);
  assert.equal(isInterruptedExit(130), true);
  assert.equal(isInterruptedExit(143), true);
  assert.equal(isInterruptedExit(1), false);
});
