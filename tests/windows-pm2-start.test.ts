import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "..");

test("pm2 ecosystem runs the bot through node and tsx instead of npm.cmd", () => {
  const config = require("../ecosystem.config.cjs") as {
    apps: Array<{ script?: string; args?: string; node_args?: string }>;
  };

  const app = config.apps.find((item) => item.script);
  assert.ok(app);
  assert.notEqual(app.script, "npm");
  assert.match(`${app.script ?? ""} ${app.node_args ?? ""} ${app.args ?? ""}`, /tsx/);
  assert.match(`${app.script ?? ""} ${app.node_args ?? ""} ${app.args ?? ""}`, /src[\\/]index\.ts/);
});

test("Windows PM2 launcher starts the ecosystem file, not npm directly", () => {
  const script = fs.readFileSync(
    path.join(repoRoot, "scripts", "windows", "start-pm2.ps1"),
    "utf-8",
  );

  assert.match(script, /pm2\s+start\s+ecosystem\.config\.cjs/i);
  assert.doesNotMatch(script, /pm2\s+start\s+npm/i);
});

test("Windows PM2 launcher rebuilds any existing process with the latest config", () => {
  const script = fs.readFileSync(
    path.join(repoRoot, "scripts", "windows", "start-pm2.ps1"),
    "utf-8",
  );

  assert.match(script, /pm2\s+delete\s+weixin-claude-bot/i);
  assert.doesNotMatch(script, /pm2\s+restart\s+weixin-claude-bot/i);
});

test("Windows startup task uses the PM2 launcher instead of foreground npm start", () => {
  const script = fs.readFileSync(
    path.join(repoRoot, "scripts", "windows", "install-startup-task.ps1"),
    "utf-8",
  );

  assert.match(script, /start-pm2\.ps1/);
  assert.doesNotMatch(script, /start\.ps1/);
});

test("Windows CMD wrapper runs the PowerShell PM2 launcher explicitly", () => {
  const script = fs.readFileSync(
    path.join(repoRoot, "scripts", "windows", "start-pm2.cmd"),
    "utf-8",
  );

  assert.match(script, /powershell\.exe/i);
  assert.match(script, /-ExecutionPolicy\s+Bypass/i);
  assert.match(script, /start-pm2\.ps1/i);
});
