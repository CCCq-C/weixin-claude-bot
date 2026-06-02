import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthExpiredError,
  isAuthExpiredPayload,
  isAuthExpiredError,
} from "../src/auth-errors.js";

test("recognizes auth expired payloads from common ret or error fields", () => {
  assert.equal(isAuthExpiredPayload({ ret: 401 }), true);
  assert.equal(isAuthExpiredPayload({ errCode: 403 }), true);
  assert.equal(isAuthExpiredPayload({ error_code: 401 }), true);
  assert.equal(isAuthExpiredPayload({ ret: 0 }), false);
  assert.equal(isAuthExpiredPayload({ errMsg: "temporary network error" }), false);
});

test("recognizes auth expired text messages", () => {
  assert.equal(isAuthExpiredPayload({ errMsg: "invalid token" }), true);
  assert.equal(isAuthExpiredPayload({ message: "unauthorized" }), true);
  assert.equal(isAuthExpiredPayload({ errmsg: "access token expired" }), true);
});

test("identifies AuthExpiredError instances", () => {
  const error = new AuthExpiredError("getupdates auth expired");

  assert.equal(isAuthExpiredError(error), true);
  assert.equal(isAuthExpiredError(new Error("other")), false);
});
