import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobRecord<T = unknown, R = unknown> {
  id: string;
  type: string;
  status: JobStatus;
  progressPct: number;
  stage: string | null;
  payload: T;
  result: R | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
}

export interface JobContext {
  jobId: string;
  signal: AbortSignal;
  reportProgress: (progressPct: number, stage?: string) => void;
}

export type JobHandler<T = unknown, R = unknown> = (
  payload: T,
  ctx: JobContext,
) => Promise<R>;

interface ActiveJobEntry {
  controller: AbortController;
  timeoutId?: NodeJS.Timeout;
}

export class JobCoordinator {
  private handlers = new Map<string, JobHandler<any, any>>();
  private activeJobs = new Map<string, ActiveJobEntry>();

  public registerHandler<T, R>(type: string, handler: JobHandler<T, R>): void {
    this.handlers.set(type, handler);
  }

  public submitJob<T>(
    db: Database.Database,
    input: {
      type: string;
      payload: T;
      maxRetries?: number;
      timeoutMs?: number;
    },
  ): JobRecord<T> {
    const id = randomUUID();
    const now = Date.now();
    const maxRetries = input.maxRetries ?? 3;

    db.prepare(`
      INSERT INTO background_jobs (
        id, type, status, progress_pct, stage, payload,
        retry_count, max_retries, created_at, updated_at
      ) VALUES (?, ?, 'queued', 0, 'queued', ?, 0, ?, ?, ?)
    `).run(
      id,
      input.type,
      JSON.stringify(input.payload ?? null),
      maxRetries,
      now,
      now,
    );

    const record = this.getJob<T>(db, id)!;

    // Dispatch asynchronously
    queueMicrotask(() => {
      this.executeJob(db, id, input.timeoutMs ?? 60_000).catch(() => {});
    });

    return record;
  }

  public cancelJob(db: Database.Database, jobId: string): boolean {
    const active = this.activeJobs.get(jobId);
    if (active) {
      if (active.timeoutId) clearTimeout(active.timeoutId);
      active.controller.abort();
      this.activeJobs.delete(jobId);
    }

    const res = db.prepare(`
      UPDATE background_jobs
      SET status = 'cancelled', stage = 'cancelled', updated_at = ?
      WHERE id = ? AND status IN ('queued', 'running')
    `).run(Date.now(), jobId);

    return res.changes > 0;
  }

  public getJob<T = unknown, R = unknown>(
    db: Database.Database,
    id: string,
  ): JobRecord<T, R> | null {
    const row = db.prepare("SELECT * FROM background_jobs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.mapJobRow<T, R>(row);
  }

  public listJobs(
    db: Database.Database,
    opts: { status?: JobStatus; type?: string; limit?: number } = {},
  ): JobRecord[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.status) {
      where.push("status = ?");
      params.push(opts.status);
    }
    if (opts.type) {
      where.push("type = ?");
      params.push(opts.type);
    }
    const limit = Math.max(1, Math.min(200, opts.limit ?? 50));
    params.push(limit);

    const sql = `
      SELECT * FROM background_jobs
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.mapJobRow(r));
  }

  public reapStaleJobs(db: Database.Database, maxRunningAgeMs = 300_000): number {
    const cutoff = Date.now() - maxRunningAgeMs;
    const res = db.prepare(`
      UPDATE background_jobs
      SET status = 'failed', error = 'Job timed out or process restarted during execution', updated_at = ?
      WHERE status = 'running' AND started_at < ?
    `).run(Date.now(), cutoff);
    return res.changes;
  }

  private async executeJob(db: Database.Database, jobId: string, timeoutMs: number): Promise<void> {
    const job = this.getJob(db, jobId);
    if (!job || job.status === "cancelled") return;

    const handler = this.handlers.get(job.type);
    if (!handler) {
      db.prepare(`
        UPDATE background_jobs
        SET status = 'failed', error = ?, updated_at = ?
        WHERE id = ?
      `).run(`No registered handler for job type: ${job.type}`, Date.now(), jobId);
      return;
    }

    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
    }

    this.activeJobs.set(jobId, { controller, timeoutId });

    const startedAt = Date.now();
    db.prepare(`
      UPDATE background_jobs
      SET status = 'running', started_at = ?, stage = 'executing', updated_at = ?
      WHERE id = ?
    `).run(startedAt, startedAt, jobId);

    const reportProgress = (pct: number, stage?: string) => {
      const now = Date.now();
      db.prepare(`
        UPDATE background_jobs
        SET progress_pct = ?, stage = coalesce(?, stage), updated_at = ?
        WHERE id = ?
      `).run(Math.max(0, Math.min(100, pct)), stage ?? null, now, jobId);
    };

    try {
      const result = await handler(job.payload, {
        jobId,
        signal: controller.signal,
        reportProgress,
      });

      if (controller.signal.aborted) {
        db.prepare(`
          UPDATE background_jobs
          SET status = 'cancelled', stage = 'aborted', updated_at = ?
          WHERE id = ?
        `).run(Date.now(), jobId);
        return;
      }

      const completedAt = Date.now();
      db.prepare(`
        UPDATE background_jobs
        SET status = 'completed', progress_pct = 100, stage = 'finished',
            result = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(result ?? null), completedAt, completedAt, jobId);
    } catch (err: unknown) {
      const isAbort = controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
      if (isAbort) {
        db.prepare(`
          UPDATE background_jobs
          SET status = 'cancelled', stage = 'cancelled', error = 'Job execution aborted', updated_at = ?
          WHERE id = ?
        `).run(Date.now(), jobId);
        return;
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      const nextRetry = job.retryCount + 1;

      if (nextRetry <= job.maxRetries) {
        // Retryable
        db.prepare(`
          UPDATE background_jobs
          SET status = 'queued', retry_count = ?, error = ?, stage = 'retrying', updated_at = ?
          WHERE id = ?
        `).run(nextRetry, errMsg, Date.now(), jobId);

        // Exponential backoff retry
        const backoffMs = Math.min(10_000, Math.pow(2, nextRetry) * 200);
        setTimeout(() => {
          this.executeJob(db, jobId, timeoutMs).catch(() => {});
        }, backoffMs);
      } else {
        // Exhausted retries
        db.prepare(`
          UPDATE background_jobs
          SET status = 'failed', error = ?, stage = 'exhausted_retries', completed_at = ?, updated_at = ?
          WHERE id = ?
        `).run(errMsg, Date.now(), Date.now(), jobId);
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      this.activeJobs.delete(jobId);
    }
  }

  private mapJobRow<T, R>(r: Record<string, unknown>): JobRecord<T, R> {
    let payload: T = null as T;
    let result: R | null = null;
    try {
      if (typeof r.payload === "string") payload = JSON.parse(r.payload);
    } catch {}
    try {
      if (typeof r.result === "string") result = JSON.parse(r.result);
    } catch {}

    return {
      id: r.id as string,
      type: r.type as string,
      status: r.status as JobStatus,
      progressPct: Number(r.progress_pct ?? 0),
      stage: (r.stage as string | null) ?? null,
      payload,
      result,
      error: (r.error as string | null) ?? null,
      retryCount: Number(r.retry_count ?? 0),
      maxRetries: Number(r.max_retries ?? 0),
      createdAt: Number(r.created_at ?? 0),
      startedAt: r.started_at != null ? Number(r.started_at) : null,
      completedAt: r.completed_at != null ? Number(r.completed_at) : null,
      updatedAt: Number(r.updated_at ?? 0),
    };
  }
}

export const globalJobCoordinator = new JobCoordinator();
