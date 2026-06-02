import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateDoctorState,
  type DoctorState,
} from "../src/doctor-checks.js";

function baseState(overrides: Partial<DoctorState> = {}): DoctorState {
  return {
    nodeMajor: 20,
    npmFound: true,
    claudeFound: true,
    claudePingOk: true,
    ilinkaiOk: true,
    vaultPath: "/tmp/weixin-claude-bot-vault",
    vaultExists: true,
    vaultWritable: true,
    whitelistUserIds: ["user@im.wechat"],
    platform: "darwin",
    ...overrides,
  };
}

test("passes when required runtime, network, vault, and whitelist are valid", () => {
  const result = evaluateDoctorState(baseState());

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test("fails when Node.js major version is below 20", () => {
  const result = evaluateDoctorState(baseState({ nodeMajor: 18 }));

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Node\.js 20\+/);
});

test("fails when Claude CLI is missing or not authenticated", () => {
  const missing = evaluateDoctorState(baseState({ claudeFound: false }));
  const unauthenticated = evaluateDoctorState(baseState({ claudePingOk: false }));

  assert.match(missing.errors.join("\n"), /Claude CLI/);
  assert.match(unauthenticated.errors.join("\n"), /Claude CLI.*login/i);
});

test("fails when vault path is missing, nonexistent, or not writable", () => {
  assert.match(
    evaluateDoctorState(baseState({ vaultPath: "" })).errors.join("\n"),
    /VAULT_PATH/,
  );
  assert.match(
    evaluateDoctorState(baseState({ vaultExists: false })).errors.join("\n"),
    /does not exist/,
  );
  assert.match(
    evaluateDoctorState(baseState({ vaultWritable: false })).errors.join("\n"),
    /not writable/,
  );
});

test("warns when whitelist is empty", () => {
  const result = evaluateDoctorState(baseState({ whitelistUserIds: [] }));

  assert.equal(result.ok, true);
  assert.match(result.warnings.join("\n"), /WHITELIST_USER_IDS/);
});

test("warns Windows users when claude command may need claude.cmd", () => {
  const result = evaluateDoctorState(
    baseState({ platform: "win32", claudeFound: true }),
  );

  assert.match(result.warnings.join("\n"), /CLAUDE_COMMAND/);
});
