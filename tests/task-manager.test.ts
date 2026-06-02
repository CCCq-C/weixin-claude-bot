import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { TaskManager } from "../src/task-manager.js";

class FakeProcess extends EventEmitter {
  killedSignals: string[] = [];
  killed = false;

  kill(signal?: string): boolean {
    this.killed = true;
    this.killedSignals.push(signal ?? "SIGTERM");
    this.emit("close", null, signal ?? "SIGTERM");
    return true;
  }
}

test("tracks running task and clears it on close", () => {
  const manager = new TaskManager();
  const proc = new FakeProcess();

  assert.equal(manager.register("user-1", proc), true);
  assert.equal(manager.has("user-1"), true);

  proc.emit("close", 0);
  assert.equal(manager.has("user-1"), false);
});

test("rejects concurrent task for same user", () => {
  const manager = new TaskManager();

  assert.equal(manager.register("user-1", new FakeProcess()), true);
  assert.equal(manager.register("user-1", new FakeProcess()), false);
});

test("cancels running task with SIGTERM", () => {
  const manager = new TaskManager();
  const proc = new FakeProcess();
  manager.register("user-1", proc);

  assert.equal(manager.cancel("user-1"), true);
  assert.deepEqual(proc.killedSignals, ["SIGTERM"]);
  assert.equal(manager.has("user-1"), false);
});

test("returns false when there is no task to cancel", () => {
  const manager = new TaskManager();

  assert.equal(manager.cancel("missing-user"), false);
});
