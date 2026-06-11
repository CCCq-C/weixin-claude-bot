import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHiddenPowerShellInvocation,
  buildClaudeSpawnInvocation,
  buildClaudeSpawnOptions,
  getClaudeCommand,
  validateVaultPath,
} from "../src/claude-command.js";

test("resolves Windows npm claude.cmd to the native Claude executable", () => {
  const exePath =
    "C:\\Users\\Alice\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\node_modules\\@anthropic-ai\\claude-code-win32-x64\\claude.exe";
  const invocation = buildClaudeSpawnInvocation({
    command: "claude.cmd",
    args: ["-p", "hello"],
    platform: "win32",
    env: { APPDATA: "C:\\Users\\Alice\\AppData\\Roaming" },
    fileExists: (filePath) => filePath === exePath,
  });

  assert.equal(invocation.command, exePath);
  assert.deepEqual(invocation.args, ["-p", "hello"]);
  assert.equal(invocation.useShell, false);
});

test("falls back to claude.cmd on native Windows when no native exe is found", () => {
  const invocation = buildClaudeSpawnInvocation({
    command: "claude",
    args: ["-p", "hello"],
    platform: "win32",
    env: {},
    fileExists: () => false,
  });

  assert.equal(invocation.command, "claude.cmd");
  assert.deepEqual(invocation.args, ["-p", "hello"]);
  assert.equal(invocation.useShell, true);
});

test("uses the matching .cmd shim for absolute Windows npm shim paths", () => {
  const invocation = buildClaudeSpawnInvocation({
    command: "C:\\Users\\Alice\\AppData\\Roaming\\npm\\claude",
    args: ["-p", "hello"],
    platform: "win32",
    env: {},
    fileExists: (filePath) =>
      filePath === "C:\\Users\\Alice\\AppData\\Roaming\\npm\\claude.cmd",
  });

  assert.equal(invocation.command, "C:\\Users\\Alice\\AppData\\Roaming\\npm\\claude.cmd");
  assert.equal(invocation.useShell, true);
});

test("builds a hidden PowerShell wrapper for Windows Claude tasks", () => {
  const invocation = buildHiddenPowerShellInvocation({
    scriptPath: "C:\\repo\\data\\claude-runs\\run.ps1",
  });

  assert.equal(invocation.command, "powershell.exe");
  assert.equal(invocation.useShell, false);
  assert.deepEqual(invocation.args, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-WindowStyle",
    "Hidden",
    "-File",
    "C:\\repo\\data\\claude-runs\\run.ps1",
  ]);
});

test("uses requested shell mode in Claude spawn options", () => {
  const options = buildClaudeSpawnOptions({
    platform: "win32",
    vaultPath: "C:\\Users\\Alice\\Documents\\Vault",
    env: { PATH: "C:\\Users\\Alice\\AppData\\Roaming\\npm" },
    useShell: false,
  });

  assert.equal(options.cwd, "C:\\Users\\Alice\\Documents\\Vault");
  assert.equal(options.shell, false);
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
