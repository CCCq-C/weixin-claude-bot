import { validateVaultPath } from "./claude-command.js";

export type DoctorState = {
  nodeMajor: number;
  npmFound: boolean;
  claudeFound: boolean;
  claudePingOk: boolean;
  ilinkaiOk: boolean;
  vaultPath: string;
  vaultExists: boolean;
  vaultWritable: boolean;
  whitelistUserIds: string[];
  platform: NodeJS.Platform;
};

export type DoctorResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function evaluateDoctorState(state: DoctorState): DoctorResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (state.nodeMajor < 20) {
    errors.push(`Node.js 20+ is required. Current major version: ${state.nodeMajor}`);
  }
  if (!state.npmFound) {
    errors.push("npm was not found. Install Node.js 20+ first.");
  }
  if (!state.claudeFound) {
    errors.push("Claude CLI was not found. Install and authenticate Claude Code CLI first.");
  } else if (!state.claudePingOk) {
    errors.push('Claude CLI login check failed. Run `claude` or `claude /login` first.');
  }
  if (!state.ilinkaiOk) {
    errors.push("Cannot reach https://ilinkai.weixin.qq.com. Check network or proxy.");
  }

  try {
    validateVaultPath(state.vaultPath);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (state.vaultPath && !state.vaultExists) {
    errors.push(`VAULT_PATH does not exist: ${state.vaultPath}`);
  }
  if (state.vaultPath && state.vaultExists && !state.vaultWritable) {
    errors.push(`VAULT_PATH is not writable: ${state.vaultPath}`);
  }

  if (state.whitelistUserIds.length === 0) {
    warnings.push("WHITELIST_USER_IDS is empty. The bot will not enter message polling.");
  }
  if (state.platform === "win32" && state.claudeFound) {
    warnings.push(
      "Windows note: if Claude cannot start later, set CLAUDE_COMMAND=claude.cmd or an absolute command path.",
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}
