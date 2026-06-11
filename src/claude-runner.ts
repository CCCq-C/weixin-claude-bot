/**
 * 调本地 Claude CLI 在 VAULT_PATH 里干活。
 *
 * 关键点：
 *   - cwd = VAULT_PATH，让 claude 的所有 read/write/edit 落到 Obsidian 仓库
 *   - --output-format json 拿到 { result, session_id, ... } 结构化输出
 *   - 按 userId 持久化 session_id 到 data/claude-sessions.json，下一轮 --resume 接着聊
 *   - 180s 超时 SIGKILL，防止失控子进程吃光机器
 *
 * 不做的事（避免越界）：
 *   - 不解析 result 里的 markdown / 工具调用 — 原样回给微信
 *   - 不并发限流 — 单用户单消息串行，多用户场景到 M4 再加
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import {
  buildHiddenPowerShellInvocation,
  buildClaudeSpawnInvocation,
  buildClaudeSpawnOptions,
  type ClaudeSpawnInvocation,
} from "./claude-command.js";
import { taskManager } from "./task-manager.js";
import { buildAgentInput, CLAUDE_CODE_CAPABILITIES } from "./agent-capabilities.js";

const SESSIONS_PATH = path.resolve("data/claude-sessions.json");
const TIMEOUT_MS = 180_000;

/**
 * 微信回复礼仪：附加到 Claude 的系统提示。
 * 目的：避开腾讯 ilinkai 的内容审核（实测会把含新闻/敏感词的长文本替换成"请稍后再试"）。
 * 策略：完整内容写文件、回复只给短确认，不在回复里引用敏感原文。
 */
const WECHAT_REPLY_PREAMBLE = `
你的回复会通过微信发回给用户。腾讯微信对 AI 回复有内容审核：
1. **能写文件就写文件**：如果用户让你查/总结/整理东西，主动新建 Obsidian 笔记保存完整内容，回复里只说一句"已写入 <相对路径>"。
2. **回复保持简短中性**：回复尽量 100 字以内，避免直接引用新闻标题、政治内容、国名、领导人名等可能触发审核的原文。
3. **回复被拦怎么办**：用户如果说"没收到回复"或"显示请稍后再试"，请意识到刚才的回复可能被审核拦了，重写一个更简短中性的版本。
4. **示例**
   - ❌ 回复：「2026年5月4日要闻：习近平访问 X 国，提出 Y 倡议……」
   - ✅ 回复：「已总结到 笔记/2026-05-04 新闻摘要.md，详情请在 Obsidian 查看。」
其它正常工作流程不变（你仍可以自由读写文件、联网查资料）。
`.trim();

type SessionMap = Record<string, string>; // userId -> session_id

function loadSessions(): SessionMap {
  if (!fs.existsSync(SESSIONS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_PATH, "utf-8")) as SessionMap;
  } catch {
    return {};
  }
}

function saveSessions(sessions: SessionMap): void {
  fs.mkdirSync(path.dirname(SESSIONS_PATH), { recursive: true });
  fs.writeFileSync(SESSIONS_PATH, JSON.stringify(sessions, null, 2), "utf-8");
}

type ClaudeJsonOutput = {
  result?: string;
  session_id?: string;
  is_error?: boolean;
  // 其他字段不关心
};

type ClaudeRunFiles = {
  dir: string;
  payloadPath: string;
  scriptPath: string;
  stdoutPath: string;
  stderrPath: string;
  exitPath: string;
};

export function isInterruptedExit(code: number | null): boolean {
  return code === null || code === 130 || code === 143;
}

function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function createClaudeRunFiles(): ClaudeRunFiles {
  const parentDir = path.resolve("data", "claude-runs");
  fs.mkdirSync(parentDir, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parentDir, "run-"));
  return {
    dir,
    payloadPath: path.join(dir, "payload.json"),
    scriptPath: path.join(dir, "run.ps1"),
    stdoutPath: path.join(dir, "stdout.txt"),
    stderrPath: path.join(dir, "stderr.txt"),
    exitPath: path.join(dir, "exit.txt"),
  };
}

function writeWindowsHiddenClaudeRunner({
  files,
  invocation,
}: {
  files: ClaudeRunFiles;
  invocation: ClaudeSpawnInvocation;
}): ClaudeSpawnInvocation {
  fs.writeFileSync(
    files.payloadPath,
    JSON.stringify(
      {
        command: invocation.command,
        args: invocation.args,
        cwd: config.vaultPath,
        stdoutPath: files.stdoutPath,
        stderrPath: files.stderrPath,
        exitPath: files.exitPath,
      },
      null,
      2,
    ),
    "utf-8",
  );

  const script = [
    '$ErrorActionPreference = "Continue"',
    "[Console]::InputEncoding = [System.Text.Encoding]::UTF8",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    `$payload = Get-Content -LiteralPath ${psSingleQuote(files.payloadPath)} -Raw -Encoding UTF8 | ConvertFrom-Json`,
    "$arguments = @()",
    "foreach ($item in $payload.args) { $arguments += [string]$item }",
    "Set-Location -LiteralPath $payload.cwd",
    "& $payload.command @arguments 2> $payload.stderrPath | Out-File -FilePath $payload.stdoutPath -Encoding UTF8",
    "$code = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 }",
    "Set-Content -LiteralPath $payload.exitPath -Value $code -Encoding UTF8",
    "exit $code",
    "",
  ].join("\r\n");

  fs.writeFileSync(files.scriptPath, script, "utf-8");
  return buildHiddenPowerShellInvocation({ scriptPath: files.scriptPath });
}

export function readTextFileIfExists(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  const bytes = fs.readFileSync(filePath);
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.toString("utf16le").replace(/^\uFEFF/, "");
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return bytes.swap16().toString("utf16le").replace(/^\uFEFF/, "");
  }
  return bytes.toString("utf-8").replace(/^\uFEFF/, "");
}

function readWindowsExitCode(files: ClaudeRunFiles, fallback: number | null): number | null {
  const raw = readTextFileIfExists(files.exitPath).trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanupClaudeRunFiles(files: ClaudeRunFiles): void {
  try {
    fs.rmSync(files.dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only; logs still contain the error if Claude failed.
  }
}

export async function runClaude(prompt: string, userId: string): Promise<string> {
  if (taskManager.has(userId)) {
    return "当前已有任务正在执行，请等待完成，或发送 /stop 中断当前任务。";
  }

  const sessions = loadSessions();
  const agentPrompt = buildAgentInput({
    userText: prompt,
    capabilities: CLAUDE_CODE_CAPABILITIES,
  });
  // bypassPermissions：跳过所有权限弹窗
  // 安全护栏：上层 index.ts 已用 WHITELIST_USER_IDS 限定为 bot 主人自己；
  // 没有白名单的人发的消息根本进不到这里。
  const claudeOptions = [
    "--output-format",
    "json",
    "--permission-mode",
    "bypassPermissions",
    "--append-system-prompt",
    WECHAT_REPLY_PREAMBLE,
  ];
  if (config.claudeModel) {
    claudeOptions.push("--model", config.claudeModel);
  }
  if (sessions[userId]) {
    claudeOptions.push("--resume", sessions[userId]);
  }
  const args = ["-p", agentPrompt, ...claudeOptions];

  return new Promise((resolve) => {
    const claudeInvocation = buildClaudeSpawnInvocation({
      command: config.claudeCommand,
      args,
      env: process.env,
    });
    let runFiles: ClaudeRunFiles | undefined;
    const invocation =
      process.platform === "win32"
        ? writeWindowsHiddenClaudeRunner({
            files: (runFiles = createClaudeRunFiles()),
            invocation: claudeInvocation,
          })
        : claudeInvocation;
    const proc = spawn(
      invocation.command,
      invocation.args,
      buildClaudeSpawnOptions({
        vaultPath: config.vaultPath,
        env: process.env,
        useShell: invocation.useShell,
      }),
    );
    if (!taskManager.register(userId, proc)) {
      proc.kill("SIGTERM");
      resolve("当前已有任务正在执行，请等待完成，或发送 /stop 中断当前任务。");
      return;
    }
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => (stdout += d.toString("utf-8")));
    proc.stderr?.on("data", (d: Buffer) => (stderr += d.toString("utf-8")));

    const killer = setTimeout(() => {
      proc.kill("SIGKILL");
    }, TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(killer);
      if (runFiles) {
        const wrapperStdout = stdout;
        const wrapperStderr = stderr;
        stdout = readTextFileIfExists(runFiles.stdoutPath) || wrapperStdout;
        stderr = readTextFileIfExists(runFiles.stderrPath) || wrapperStderr;
        code = readWindowsExitCode(runFiles, code);
      }
      if (isInterruptedExit(code)) {
        if (runFiles) cleanupClaudeRunFiles(runFiles);
        resolve("任务已中断。");
        return;
      }

      if (code !== 0) {
        const logHint = runFiles ? `\n日志目录: ${runFiles.dir}` : "";
        resolve(
          `[Claude 退出码 ${code}]${logHint}\n${(stderr || stdout).slice(0, 1500)}`,
        );
        return;
      }

      try {
        const data = JSON.parse(stdout) as ClaudeJsonOutput;

        // 持久化 session 用于下一轮多轮对话
        if (data.session_id) {
          sessions[userId] = data.session_id;
          saveSessions(sessions);
        }

        if (data.is_error && data.result) {
          if (runFiles) cleanupClaudeRunFiles(runFiles);
          resolve(`[Claude 报错] ${data.result.slice(0, 2000)}`);
          return;
        }

        if (runFiles) cleanupClaudeRunFiles(runFiles);
        resolve(data.result ?? "[Claude 返回空]");
      } catch {
        // 解析失败 fallback 直接给原始输出
        if (runFiles) cleanupClaudeRunFiles(runFiles);
        resolve(stdout.slice(0, 3500) || "[Claude 无输出]");
      }
    });

    proc.on("error", (e) => {
      clearTimeout(killer);
      if (runFiles) cleanupClaudeRunFiles(runFiles);
      resolve(`[启动 claude 失败] ${e.message}`);
    });
  });
}

export function cancelClaude(userId: string): boolean {
  return taskManager.cancel(userId);
}

export function getClaudeTaskStatus(userId: string): string {
  return taskManager.status(userId);
}

/** 重置某个用户的会话（M4 才会用，预留 export） */
export function resetSession(userId: string): void {
  const sessions = loadSessions();
  if (sessions[userId]) {
    delete sessions[userId];
    saveSessions(sessions);
  }
}
