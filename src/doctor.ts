import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { config } from "./config.js";
import { evaluateDoctorState, type DoctorState } from "./doctor-checks.js";

function commandOk(command: string, args: string[] = []): boolean {
  const result = spawnSync(command, args, {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

async function ilinkaiOk(): Promise<boolean> {
  try {
    const response = await fetch("https://ilinkai.weixin.qq.com", {
      method: "HEAD",
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

function pathExists(pathname: string): boolean {
  return !!pathname && fs.existsSync(pathname);
}

function pathWritable(pathname: string): boolean {
  if (!pathname || !fs.existsSync(pathname)) return false;
  try {
    fs.accessSync(pathname, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function collectState(): Promise<DoctorState> {
  return {
    nodeMajor: Number(process.versions.node.split(".")[0] ?? 0),
    npmFound: commandOk("npm", ["-v"]),
    claudeFound: commandOk(config.claudeCommand, ["--version"]),
    claudePingOk: commandOk(config.claudeCommand, [
      "-p",
      "ping",
      "--output-format",
      "json",
    ]),
    ilinkaiOk: await ilinkaiOk(),
    vaultPath: config.vaultPath,
    vaultExists: pathExists(config.vaultPath),
    vaultWritable: pathWritable(config.vaultPath),
    whitelistUserIds: config.whitelistUserIds,
    platform: process.platform,
  };
}

const state = await collectState();
const result = evaluateDoctorState(state);

console.log("== weixin-claude-bot doctor ==");
console.log(`Node.js: ${process.version}`);
console.log(`Platform: ${process.platform}`);
console.log(`Claude command: ${config.claudeCommand}`);
console.log(`VAULT_PATH: ${config.vaultPath || "(empty)"}`);
console.log(
  `WHITELIST_USER_IDS: ${
    config.whitelistUserIds.length > 0 ? config.whitelistUserIds.join(", ") : "(empty)"
  }`,
);

for (const warning of result.warnings) {
  console.log(`WARN: ${warning}`);
}
for (const error of result.errors) {
  console.error(`ERROR: ${error}`);
}

if (!result.ok) {
  process.exit(1);
}

console.log("Doctor passed.");
