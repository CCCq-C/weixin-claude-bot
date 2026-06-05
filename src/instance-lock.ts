import fs from "node:fs";
import path from "node:path";

type InstanceLockOptions = {
  pid?: number;
  isProcessAlive?: (pid: number) => boolean;
};

type InstanceLock =
  | { acquired: true; path: string; release: () => void }
  | { acquired: false; path: string; message: string; release: () => void };

const LOCK_FILE = "bot.lock";

export function acquireInstanceLock(
  dataDir = "data",
  options: InstanceLockOptions = {},
): InstanceLock {
  const pid = options.pid ?? process.pid;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  fs.mkdirSync(dataDir, { recursive: true });

  const lockPath = path.join(dataDir, LOCK_FILE);
  const payload = JSON.stringify(
    { pid, startedAt: new Date().toISOString() },
    null,
    2,
  );

  while (true) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeFileSync(fd, payload, "utf-8");
      fs.closeSync(fd);
      return {
        acquired: true,
        path: lockPath,
        release: () => releaseLock(lockPath, pid),
      };
    } catch (error: unknown) {
      if (!isFileExistsError(error)) throw error;

      const existingPid = readLockPid(lockPath);
      if (existingPid && isProcessAlive(existingPid)) {
        return {
          acquired: false,
          path: lockPath,
          message: `weixin-claude-bot is already running with pid ${existingPid}. Stop the existing process before starting another one.`,
          release: () => {},
        };
      }

      try {
        fs.unlinkSync(lockPath);
      } catch (unlinkError: unknown) {
        if (!isNotFoundError(unlinkError)) throw unlinkError;
      }
    }
  }
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockPid(lockPath: string): number | null {
  try {
    const raw = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as { pid?: unknown };
    return typeof raw.pid === "number" && Number.isInteger(raw.pid) ? raw.pid : null;
  } catch {
    return null;
  }
}

function releaseLock(lockPath: string, pid: number): void {
  if (readLockPid(lockPath) !== pid) return;
  try {
    fs.unlinkSync(lockPath);
  } catch (error: unknown) {
    if (!isNotFoundError(error)) throw error;
  }
}

function isFileExistsError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
