import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { runMigrations } from "../lib/db/migrate.ts";
import { diagnostics } from "../lib/diagnostics/logger.ts";

let db: Database.Database;
let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-diagnostics-test-"));
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

describe("Phase 10: Observability & Diagnostics", () => {
  it("records metrics and tracks latencies", () => {
    diagnostics.recordRequest(45);
    diagnostics.recordRequest(55);
    diagnostics.recordProviderLatency("openai", 120);
    diagnostics.recordProviderLatency("openai", 180);
    diagnostics.recordToolExecution("web_search", 350);

    const summary = diagnostics.getMetricsSummary();
    assert.ok(summary.totalRequests >= 2);
    assert.equal(summary.avgProviderLatencyMs, 150);
    assert.ok(summary.recordedTools.includes("web_search"));
  });

  it("redacts sensitive keys from metadata logs", () => {
    diagnostics.log("error", "provider_failed", {
      metadata: {
        rawKey: "sk-abcdef1234567890abcdef1234567890",
        endpoint: "https://api.anthropic.com",
      },
    });

    const recent = diagnostics.getRecentLogs(10);
    const failureLog = recent.find((l) => l.event === "provider_failed");
    assert.ok(failureLog);
    assert.equal(failureLog?.metadata?.rawKey, "[REDACTED_SECRET]");
  });

  it("generates comprehensive diagnostic report with db statistics", () => {
    const report = diagnostics.generateReport(db);
    assert.equal(report.status, "healthy");
    assert.ok(typeof report.uptimeSeconds === "number");
    assert.ok(report.environment.nodeVersion);
    assert.ok(report.dbStats);
    assert.equal(typeof (report.dbStats as any).fileCount, "number");
  });
});
