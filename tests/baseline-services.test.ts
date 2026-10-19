/**
 * Phase 3: Feature Baseline & Regression Protection
 * Validates baseline behaviors across Providers, Tracking (Projects/Tasks/Cycles),
 * Goals & Milestones, and Web SSRF Defense.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { runMigrations } from "../lib/db/migrate.ts";
import {
  createProvider,
  listProviders,
  connectionFor,
  deleteProvider,
  type VaultCtx,
} from "../lib/providers-service.ts";
import {
  createProject,
  createTask,
  addTaskDependency,
  updateTask,
  TrackingError,
  type TrackingCtx,
} from "../lib/tracking-service.ts";
import {
  createGoal,
  listGoals,
  createMilestone,
  updateMilestone,
  type GoalCtx,
} from "../lib/goal-service.ts";
import { performWebFetch } from "../lib/agent/web-fetch.ts";

let db: Database.Database;
const masterKey = randomBytes(32);
let tmpDir: string;
let vaultCtx: VaultCtx;
let trackingCtx: TrackingCtx;
let goalCtx: GoalCtx;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-baseline-test-"));
  const p = path.join(tmpDir, "vault.db");
  process.env.VAULT_DB_PATH = p;
  db = new Database(p);
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  vaultCtx = { db, key: masterKey };
  trackingCtx = { db };
  goalCtx = { db };
});

after(() => {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

describe("Phase 3 Baseline: Provider Configuration & Credential Encryption", () => {
  it("stores AI providers with AES-256-GCM encrypted API keys", () => {
    const p1 = createProvider(vaultCtx, {
      name: "OpenAI Production",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test-secret-key-12345",
      models: ["gpt-4o", "gpt-4o-mini"],
      isDefault: true,
    });

    assert.ok(p1.id > 0);
    assert.equal(p1.name, "OpenAI Production");
    assert.equal(p1.hasKey, true);

    // Verify key in raw database is encrypted (not plaintext)
    const raw = db.prepare("SELECT api_key FROM ai_providers WHERE id = ?").get(p1.id) as { api_key: Buffer };
    assert.ok(raw.api_key);
    assert.ok(!raw.api_key.toString("utf8").includes("sk-test-secret-key-12345"), "Raw API key must not be plaintext in DB");

    // Decrypt key under master key
    const conn = connectionFor(vaultCtx, p1.id);
    assert.equal(conn.apiKey, "sk-test-secret-key-12345");

    // List providers
    const list = listProviders(vaultCtx);
    assert.ok(list.length >= 1);
    const found = list.find((p) => p.id === p1.id);
    assert.ok(found);
    assert.equal(found?.isDefault, true);

    // Clean up
    deleteProvider(vaultCtx, p1.id);
    assert.throws(() => connectionFor(vaultCtx, p1.id), /Provider not found/);
  });
});

describe("Phase 3 Baseline: Tasks & Dependency Integrity", () => {
  it("detects dependency cycles and prevents completing blocked tasks", () => {
    const project = createProject(trackingCtx, { title: "Mission Critical Project" });
    assert.ok(project.id > 0);

    const taskA = createTask(trackingCtx, { projectId: project.id, title: "Task A - Database Architecture" });
    const taskB = createTask(trackingCtx, { projectId: project.id, title: "Task B - API Handlers" });

    // Task A blocks Task B (Task B depends on Task A)
    addTaskDependency(trackingCtx, { taskId: taskA.id, blocksTaskId: taskB.id });

    // Task B blocking Task A must fail with dep_cycle
    assert.throws(
      () => addTaskDependency(trackingCtx, { taskId: taskB.id, blocksTaskId: taskA.id }),
      (err: unknown) => err instanceof TrackingError && err.code === "dep_cycle"
    );

    // Task B cannot be marked done while Task A is open (blocked_by_dependencies)
    assert.throws(
      () => updateTask(trackingCtx, taskB.id, { status: "done" }),
      (err: unknown) => err instanceof TrackingError && err.code === "blocked_by_dependencies"
    );

    // Once Task A is completed, Task B can be marked done
    updateTask(trackingCtx, taskA.id, { status: "done" });
    const doneB = updateTask(trackingCtx, taskB.id, { status: "done" });
    assert.equal(doneB.status, "done");
  });
});

describe("Phase 3 Baseline: Goals & Auto-Computed Milestone Progress", () => {
  it("computes goal progress accurately based on milestone completion", () => {
    const goal = createGoal(goalCtx, {
      title: "Master Physics JEE Advanced",
      description: "Complete all mechanics & electrodynamics",
    });
    assert.ok(goal.id > 0);
    assert.equal(goal.progressPct, 0);

    const m1 = createMilestone(goalCtx, { goalId: goal.id, title: "Rotational Dynamics" });
    const m2 = createMilestone(goalCtx, { goalId: goal.id, title: "Gauss Law" });

    // Mark 1 of 2 milestones done
    updateMilestone(goalCtx, goal.id, m1.id, { done: true });

    const goals = listGoals(goalCtx);
    const updatedGoal = goals.find((g) => g.id === goal.id);
    assert.ok(updatedGoal);
    assert.equal(updatedGoal.progressPct, 50);

    // Mark 2nd done
    updateMilestone(goalCtx, goal.id, m2.id, { done: true });
    const finalGoals = listGoals(goalCtx);
    const completedGoal = finalGoals.find((g) => g.id === goal.id);
    assert.equal(completedGoal?.progressPct, 100);
  });
});

describe("Phase 3 Baseline: Web SSRF Protection", () => {
  it("rejects loopback and private IP fetch attempts", async () => {
    const localRes = await performWebFetch("http://localhost:3000/api/files");
    assert.match(localRes, /Security Error: SSRF Protection/i);

    const loopbackRes = await performWebFetch("http://127.0.0.1:8080/metrics");
    assert.match(loopbackRes, /Security Error: SSRF Protection/i);

    const privateRes = await performWebFetch("http://192.168.1.1/admin");
    assert.match(privateRes, /Security Error: SSRF Protection/i);

    const metadataRes = await performWebFetch("http://169.254.169.254/latest/meta-data/");
    assert.match(metadataRes, /Security Error: SSRF Protection/i);

    const invalidProto = await performWebFetch("ftp://example.com/file");
    assert.match(invalidProto, /URL must begin with/i);
  });
});
