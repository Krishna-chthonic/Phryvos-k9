import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import {
  createDot,
  createDotTask,
  getDotTask,
  claimDueDotTask,
  completeDotTask,
  type DotTaskDto,
} from "@/lib/dots-service";
import { DotRunner } from "@/lib/dots-runner";
import type { VaultCtx } from "@/lib/providers-service";

function createInMemoryTestContext(): VaultCtx {
  const db = new Database(":memory:");
  const key = crypto.randomBytes(32);
  runMigrations(db);
  return { db, key };
}

test("Phase 2: Background Reliability & Scheduler (D-06 to D-11)", async (t) => {
  await t.test("D-06: Task failure triggers exponential backoff up to max_retries before marking failed", async () => {
    const ctx = createInMemoryTestContext();
    const dot = createDot(ctx, { name: "Worker", role: "Specialist", systemPrompt: "S", tools: [] });
    const task = createDotTask(ctx, dot.id, { prompt: "Flaky Job" });

    // Initial state: retryCount should be 0, status queued
    assert.equal(task.retryCount, 0);
    assert.equal(task.status, "queued");

    // 1st failure: should increment retryCount to 1, schedule with backoff, stay queued
    completeDotTask(ctx.db, task.id, { error: "Network timeout 1" });
    let current = getDotTask(ctx, task.id);
    assert.ok(current);
    assert.equal(current.retryCount, 1);
    assert.equal(current.status, "queued", "Task must remain queued for retry while under max_retries");
    assert.ok(current.nextRunAt && current.nextRunAt > Date.now(), "nextRunAt must be pushed into future");

    // 2nd failure: should increment retryCount to 2
    completeDotTask(ctx.db, task.id, { error: "Network timeout 2" });
    current = getDotTask(ctx, task.id);
    assert.ok(current);
    assert.equal(current.retryCount, 2);
    assert.equal(current.status, "queued");

    // 3rd failure: should hit max_retries (3) and transition to "failed"
    completeDotTask(ctx.db, task.id, { error: "Network timeout 3" });
    current = getDotTask(ctx, task.id);
    assert.ok(current);
    assert.equal(current.retryCount, 3);
    assert.equal(current.status, "failed", "Task must transition to failed after reaching max_retries");

    // Successful completion of another task resets retryCount to 0
    const task2 = createDotTask(ctx, dot.id, { prompt: "Good Job", intervalSeconds: 60 });
    completeDotTask(ctx.db, task2.id, { error: "Temporary hiccup" });
    assert.equal(getDotTask(ctx, task2.id)?.retryCount, 1);
    completeDotTask(ctx.db, task2.id, { resultText: "All done!" });
    assert.equal(getDotTask(ctx, task2.id)?.retryCount, 0, "Successful run must reset retryCount to 0");
  });

  await t.test("D-07: Atomic task claim prevents race conditions between workers", async () => {
    const ctx = createInMemoryTestContext();
    const dot = createDot(ctx, { name: "Worker", role: "Specialist", systemPrompt: "S", tools: [] });
    const task = createDotTask(ctx, dot.id, { prompt: "Single Execution Task", nextRunAt: Date.now() - 1000 });

    // Worker 1 claims task
    const claim1 = claimDueDotTask(ctx.db);
    assert.ok(claim1, "Worker 1 should claim task");
    assert.equal(claim1.task.id, task.id);

    // Worker 2 attempts to claim at the exact same moment
    const claim2 = claimDueDotTask(ctx.db);
    assert.equal(claim2, null, "Worker 2 must receive null since task was atomically claimed");
  });

  await t.test("D-09: Zombie task reconciler resets orphaned running tasks", async () => {
    const ctx = createInMemoryTestContext();
    const dot = createDot(ctx, { name: "Worker", role: "Specialist", systemPrompt: "S", tools: [] });
    const task = createDotTask(ctx, dot.id, { prompt: "Stuck Job" });

    // Simulate task stuck in 'running' state since 30 minutes ago
    const stuckTime = Date.now() - 30 * 60 * 1000;
    ctx.db.prepare("UPDATE dot_tasks SET status = 'running', last_run_at = ? WHERE id = ?").run(stuckTime, task.id);

    const runner = DotRunner.getInstance();
    const reconciledCount = runner.reconcileZombieTasks(ctx.db, 10 * 60 * 1000);
    assert.equal(reconciledCount, 1, "Must reconcile 1 stuck task");

    const recovered = getDotTask(ctx, task.id);
    assert.ok(recovered);
    assert.equal(recovered.status, "queued", "Recovered task must be set back to queued");
    assert.match(recovered.error || "", /interrupted/i);
  });

  await t.test("D-10: Task status machine supports aborting active execution", async () => {
    const runner = DotRunner.getInstance();
    const dummyTaskId = "task_test_abort_123";

    // Test aborting when no active task exists
    assert.equal(runner.abortTask("non_existent"), false);

    // Register active abort controller
    const ac = new AbortController();
    (runner as any).abortControllers.set(dummyTaskId, ac);

    // Abort active task
    const aborted = runner.abortTask(dummyTaskId);
    assert.equal(aborted, true, "Must return true on active task abort");
    assert.equal(ac.signal.aborted, true, "AbortSignal must be aborted");
  });
});
