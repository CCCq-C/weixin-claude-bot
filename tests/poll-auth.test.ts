import test from "node:test";
import assert from "node:assert/strict";
import { collectPollEventsForTest } from "../src/poll.js";
import { AuthExpiredError } from "../src/auth-errors.js";

test("stops polling when auth expires", async () => {
  const events = await collectPollEventsForTest(async () => {
    throw new AuthExpiredError("token expired");
  });

  assert.deepEqual(events, [{ type: "auth-expired", message: "token expired" }]);
});
