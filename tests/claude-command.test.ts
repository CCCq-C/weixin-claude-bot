import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClaudeSpawnOptions,
  getClaudeCommand,
  validateVaultPath,
} from "../src/claude-command.js";

test("uses shell mode on native Windows so claude.cmd can be resolved", () => {
  const options = buildClaudeSpawnOptions({
    platform: "win32",
    vaultPath: "C:\\Users\\Alice\\Documents\\Vault",
    env: { PATH: "C:\\Users\\Alice\\AppData\\Roaming\\npm" },
  });

  assert.equal(options.cwd, "C:\\Users\\Alice\\Documents\\Vault");
  assert.equal(options.shell, true);
});

test("hides the transient Claude command window on native Windows", () => {
  const options = buildClaudeSpawnOptions({
    platform: "win32",
    vaultPath: "C:\\Users\\Alice\\Documents\\Vault",
    env: {},
  });

  assert.equal(options.windowsHide, true);
});

test("closes Claude stdin explicitly so Windows tasks do not wait for input", () => {
  const options = buildClaudeSpawnOptions({
    platform: "win32",
    vaultPath: "C:\\Users\\Alice\\Documents\\Vault",
    env: {},
  });

  assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
});

test("does not use shell mode on macOS or Linux", () => {
  assert.equal(
    buildClaudeSpawnOptions({
      platform: "darwin",
      vaultPath: "/Users/alice/Vault",
      env: {},
    }).shell,
    false,
  );
  assert.equal(
    buildClaudeSpawnOptions({
      platform: "linux",
      vaultPath: "/home/alice/Vault",
      env: {},
    }).shell,
    false,
  );
});

test("allows overriding the Claude command for unusual Windows installs", () => {
  assert.equal(
    getClaudeCommand({ CLAUDE_COMMAND: "C:\\Tools\\claude.cmd" }),
    "C:\\Tools\\claude.cmd",
  );
  assert.equal(getClaudeCommand({}), "claude");
});

test("rejects empty, relative, and home-directory vault paths", () => {
  assert.throws(() => validateVaultPath(""), /VAULT_PATH/);
  assert.throws(() => validateVaultPath("notes"), /absolute/);
  assert.throws(() => validateVaultPath("C:\\Users\\Alice"), /whole home/i);
  assert.throws(() => validateVaultPath("/Users/alice"), /whole home/i);
});

test("accepts absolute Windows and POSIX vault paths", () => {
  assert.doesNotThrow(() =>
    validateVaultPath("C:\\Users\\Alice\\Documents\\ObsidianVault"),
  );
  assert.doesNotThrow(() => validateVaultPath("/Users/alice/ObsidianVault"));
});
