import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { ZodError, z } from "zod";

import { runMigrations } from "../lib/db/migrate.ts";
import { AppError, sanitizeErrorText, handleRouteError } from "../lib/errors/index.ts";
import { JobCoordinator, type JobContext } from "../lib/jobs/job-coordinator.ts";

let db: Database.Database;
let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-err-jobs-test-"));
  const dbPath = path.join(tmpDir, "vault.db");
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  runMigrations(db);
});

after(() => {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

describe("Phase 8: Centralized Error Handling & Sanitization", () => {
  it("sanitizes API keys and sensitive tokens from error strings", () => {
    const raw = "Failed call to https://api.openai.com with key sk-1234567890abcdef1234567890 and Bearer eyJhbGciOiJIUzI1NiJ9.secret";
    const clean = sanitizeErrorText(raw);
    assert.ok(!clean.includes("sk-1234567890abcdef1234567890"), "Raw sk- key must be redacted");
    assert.ok(!clean.includes("eyJhbGciOiJIUzI1NiJ9.secret"), "Bearer token must be redacted");
    assert.ok(clean.includes("[REDACTED_SECRET]"));
  });

  it("constructs AppError with correct status codes and defaults", () => {
    const validationErr = new AppError({
      code: "VALIDATION_ERROR",
      safeMessage: "Bad input provided",
    });
    assert.equal(validationErr.statusCode, 400);
    assert.equal(validationErr.retryable, false);

    const rateLimitErr = new AppError({
      code: "RATE_LIMIT",
      safeMessage: "Too many requests to provider",
    });
    assert.equal(rateLimitErr.statusCode, 429);
    assert.equal(rateLimitErr.retryable, true);

    const json = rateLimitErr.toResponseJson();
    assert.equal(json.ok, false);
    assert.equal(json.error.code, "RATE_LIMIT");
    assert.equal(json.error.retryable, true);
    assert.ok(json.error.correlationId);
  });

  it("formats Zod and unknown errors via handleRouteError", async () => {
    // Simulated ZodError
    const schema = z.object({ title: z.string().min(3) });
    const parsed = schema.safeParse({ title: "a" });
    assert.equal(parsed.success, false);

    if (!parsed.success) {
      const res = handleRouteError(parsed.error);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.equal(body.error.code, "VALIDATION_ERROR");
      assert.ok(Array.isArray(body.error.details.issues));
    }
  });
});

describe("Phase 9: Background Job & Cancellation Infrastructure", () => {
  it("processes a background job to completion with progress reporting", async () => {
    const coordinator = new JobCoordinator();

    coordinator.registerHandler("test_compute", async (payload: { steps: number }, ctx: JobContext) => {
      for (let i = 1; i <= payload.steps; i++) {
        if (ctx.signal.aborted) throw new Error("Abort requested");
        ctx.reportProgress(Math.round((i / payload.steps) * 100), `step_${i}`);
        await new Promise((r) => setTimeout(r, 20));
      }
      return { totalProcessed: payload.steps, status: "ok" };
    });

    const job = coordinator.submitJob(db, {
      type: "test_compute",
      payload: { steps: 3 },
    });

    assert.equal(job.status, "queued");

    // Wait for completion
    let record = coordinator.getJob(db, job.id);
    for (let attempts = 0; attempts < 30; attempts++) {
      await new Promise((r) => setTimeout(r, 40));
      record = coordinator.getJob(db, job.id);
      if (record?.status === "completed") break;
    }

    assert.equal(record?.status, "completed");
    assert.equal(record?.progressPct, 100);
    assert.deepEqual(record?.result, { totalProcessed: 3, status: "ok" });
  });

  it("aborts and cancels running jobs cleanly upon cancel signal", async () => {
    const coordinator = new JobCoordinator();

    coordinator.registerHandler("long_task", async (_payload: unknown, ctx: JobContext) => {
      for (let i = 0; i < 50; i++) {
        if (ctx.signal.aborted) {
          const err = new Error("Aborted");
          err.name = "AbortError";
          throw err;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      return "finished";
    });

    const job = coordinator.submitJob(db, {
      type: "long_task",
      payload: {},
    });

    // Give it a moment to enter 'running'
    await new Promise((r) => setTimeout(r, 30));

    // Cancel job
    const cancelled = coordinator.cancelJob(db, job.id);
    assert.equal(cancelled, true);

    await new Promise((r) => setTimeout(r, 50));
    const finalJob = coordinator.getJob(db, job.id);
    assert.equal(finalJob?.status, "cancelled");
  });

  it("reaps abandoned stale jobs", () => {
    const coordinator = new JobCoordinator();
    const oldTime = Date.now() - 600_000;

    db.prepare(`
      INSERT INTO background_jobs (
        id, type, status, progress_pct, stage, created_at, started_at, updated_at
      ) VALUES ('stale-job-1', 'heavy_sync', 'running', 40, 'syncing', ?, ?, ?)
    `).run(oldTime, oldTime, oldTime);

    const reaped = coordinator.reapStaleJobs(db, 300_000);
    assert.ok(reaped >= 1);

    const job = coordinator.getJob(db, "stale-job-1");
    assert.equal(job?.status, "failed");
    assert.match(job?.error ?? "", /timed out or process restarted/);
  });
});
