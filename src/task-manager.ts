import type { ChildProcess } from "node:child_process";
import type { EventEmitter } from "node:events";

type KillableProcess = Pick<ChildProcess, "kill" | "killed"> &
  Pick<EventEmitter, "once">;

type TaskInfo = {
  proc: KillableProcess;
  startedAt: number;
};

export class TaskManager {
  private readonly tasks = new Map<string, TaskInfo>();

  register(userId: string, proc: KillableProcess): boolean {
    if (this.tasks.has(userId)) return false;
    this.tasks.set(userId, { proc, startedAt: Date.now() });
    proc.once("close", () => {
      const current = this.tasks.get(userId);
      if (current?.proc === proc) this.tasks.delete(userId);
    });
    return true;
  }

  has(userId: string): boolean {
    return this.tasks.has(userId);
  }

  cancel(userId: string): boolean {
    const task = this.tasks.get(userId);
    if (!task) return false;
    task.proc.kill("SIGTERM");
    this.tasks.delete(userId);
    return true;
  }

  status(userId: string): string {
    const task = this.tasks.get(userId);
    if (!task) return "当前没有正在执行的任务。";
    const seconds = Math.max(0, Math.round((Date.now() - task.startedAt) / 1000));
    return `当前有任务正在执行，已运行 ${seconds} 秒。发送 /stop 可以中断。`;
  }
}

export const taskManager = new TaskManager();
