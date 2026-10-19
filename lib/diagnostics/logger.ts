import type Database from "better-sqlite3";
import { sanitizeErrorText } from "../errors/app-error";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  event: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

export interface SystemMetrics {
  totalRequests: number;
  totalErrors: number;
  providerLatencies: number[];
  toolExecutionTimes: Record<string, number[]>;
  streamingFailures: number;
  jobFailures: number;
}

class DiagnosticLogger {
  private inMemoryLogs: LogEntry[] = [];
  private maxLogs = 500;
  private metrics: SystemMetrics = {
    totalRequests: 0,
    totalErrors: 0,
    providerLatencies: [],
    toolExecutionTimes: {},
    streamingFailures: 0,
    jobFailures: 0,
  };

  public log(level: LogLevel, event: string, opts?: { durationMs?: number; metadata?: Record<string, unknown>; correlationId?: string }): void {
    const sanitizedMeta = opts?.metadata ? this.sanitizeObject(opts.metadata) : undefined;
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      event,
      durationMs: opts?.durationMs,
      metadata: sanitizedMeta,
      correlationId: opts?.correlationId,
    };

    this.inMemoryLogs.push(entry);
    if (this.inMemoryLogs.length > this.maxLogs) {
      this.inMemoryLogs.shift();
    }

    if (level === "error") {
      this.metrics.totalErrors++;
    }
  }

  public recordRequest(durationMs: number): void {
    this.metrics.totalRequests++;
    this.log("info", "http_request", { durationMs });
  }

  public recordProviderLatency(provider: string, latencyMs: number): void {
    this.metrics.providerLatencies.push(latencyMs);
    if (this.metrics.providerLatencies.length > 100) this.metrics.providerLatencies.shift();
    this.log("info", "provider_call", { durationMs: latencyMs, metadata: { provider } });
  }

  public recordToolExecution(toolName: string, durationMs: number): void {
    if (!this.metrics.toolExecutionTimes[toolName]) {
      this.metrics.toolExecutionTimes[toolName] = [];
    }
    const arr = this.metrics.toolExecutionTimes[toolName];
    arr.push(durationMs);
    if (arr.length > 50) arr.shift();
    this.log("info", "tool_execution", { durationMs, metadata: { tool: toolName } });
  }

  public recordStreamingFailure(provider: string, reason: string): void {
    this.metrics.streamingFailures++;
    this.log("warn", "streaming_failure", { metadata: { provider, reason: sanitizeErrorText(reason) } });
  }

  public recordJobFailure(jobType: string, error: string): void {
    this.metrics.jobFailures++;
    this.log("error", "job_failure", { metadata: { jobType, error: sanitizeErrorText(error) } });
  }

  public getRecentLogs(limit = 100): LogEntry[] {
    return this.inMemoryLogs.slice(-limit);
  }

  public getMetricsSummary() {
    const latencies = this.metrics.providerLatencies;
    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    return {
      totalRequests: this.metrics.totalRequests,
      totalErrors: this.metrics.totalErrors,
      streamingFailures: this.metrics.streamingFailures,
      jobFailures: this.metrics.jobFailures,
      avgProviderLatencyMs: avgLatency,
      recordedTools: Object.keys(this.metrics.toolExecutionTimes),
    };
  }

  public generateReport(db?: Database.Database) {
    let dbStats: Record<string, unknown> | null = null;
    if (db) {
      try {
        const fileCount = (db.prepare("SELECT COUNT(*) as count FROM files").get() as { count: number })?.count ?? 0;
        const sessionCount = (db.prepare("SELECT COUNT(*) as count FROM chat_sessions").get() as { count: number })?.count ?? 0;
        const memoryCount = (db.prepare("SELECT COUNT(*) as count FROM memories").get() as { count: number })?.count ?? 0;
        const jobStats = db.prepare(`
          SELECT status, count(*) as count FROM background_jobs GROUP BY status
        `).all() as Array<{ status: string; count: number }>;

        dbStats = {
          fileCount,
          sessionCount,
          memoryCount,
          jobsByStatus: Object.fromEntries(jobStats.map((r) => [r.status, r.count])),
        };
      } catch (e) {
        dbStats = { error: String(e) };
      }
    }

    return {
      timestamp: Date.now(),
      status: "healthy",
      uptimeSeconds: Math.round(process.uptime()),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      metrics: this.getMetricsSummary(),
      dbStats,
    };
  }

  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") {
        out[k] = sanitizeErrorText(v);
      } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        out[k] = this.sanitizeObject(v as Record<string, unknown>);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
}

export const diagnostics = new DiagnosticLogger();
