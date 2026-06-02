import test from "node:test";
import assert from "node:assert/strict";
import { postSigned } from "../src/api.js";
import { AuthExpiredError } from "../src/auth-errors.js";

test("postSigned throws AuthExpiredError for auth payload JSON", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ ret: 401, errMsg: "invalid token" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  try {
    await assert.rejects(
      () => postSigned("https://example.com", "token", "/x", {}),
      AuthExpiredError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
