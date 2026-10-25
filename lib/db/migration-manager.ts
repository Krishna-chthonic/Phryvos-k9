/**
 * Phase 14: Data Migrations, Schema Versioning & Rollback Safety.
 *
 * Implements deterministic schema version tracking, backup-before-migrate hook,
 * and integrity verification for SQLite databases.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { runMigrations as runBaseMigrations } from "./migrate";

export interface SchemaVersionRecord {
  version: number;
  name: string;
  appliedAt: number;
  checksum: string;
  executionTimeMs: number;
}

export interface MigrationStep {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  sql?: string;
}

/**
 * Registry of programmatic schema migrations.
 * Version 1: Base initial schema (Drizzle + virtual tables + baseline).
 * Additional incremental versions are registered here.
 */
export const MIGRATION_STEPS: MigrationStep[] = [
  {
    version: 1,
    name: "0001_baseline_drizzle_and_virtual_tables",
    sql: `
-- Drizzle migrations (from drizzle folder)
-- FTS5 virtual tables
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(name, path);
CREATE VIRTUAL TABLE IF NOT EXISTS file_content_fts USING fts5(file_id UNINDEXED, body);
-- Core tables
CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, point TEXT NOT NULL, category TEXT DEFAULT 'fact', source_session_id TEXT, source TEXT DEFAULT 'user', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE, message_id TEXT, title TEXT NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at);
CREATE TABLE IF NOT EXISTS fsrs_cards (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL REFERENCES exam_subjects(id) ON DELETE CASCADE, topic_id INTEGER REFERENCES exam_topics(id) ON DELETE SET NULL, due INTEGER NOT NULL, stability REAL NOT NULL DEFAULT 0, difficulty REAL NOT NULL DEFAULT 0, elapsed_days INTEGER NOT NULL DEFAULT 0, scheduled_days REAL NOT NULL DEFAULT 0, reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0, state INTEGER NOT NULL DEFAULT 0, last_review INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_fsrs_cards_due ON fsrs_cards(due);
CREATE INDEX IF NOT EXISTS idx_fsrs_cards_subject ON fsrs_cards(subject_id);
CREATE INDEX IF NOT EXISTS idx_fsrs_cards_topic ON fsrs_cards(topic_id);
CREATE TABLE IF NOT EXISTS background_jobs (id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL, progress_pct INTEGER NOT NULL DEFAULT 0, stage TEXT, payload TEXT, result TEXT, error TEXT, retry_count INTEGER NOT NULL DEFAULT 0, max_retries INTEGER NOT NULL DEFAULT 3, created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
CREATE TABLE IF NOT EXISTS memory_tombstones (id INTEGER PRIMARY KEY AUTOINCREMENT, content_hash TEXT UNIQUE NOT NULL, deleted_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_memory_tombstones_hash ON memory_tombstones(content_hash);
CREATE TABLE IF NOT EXISTS memory_consolidation (id INTEGER PRIMARY KEY AUTOINCREMENT, stm_key TEXT UNIQUE NOT NULL, stm_value TEXT NOT NULL, stm_access_count INTEGER NOT NULL DEFAULT 0, stm_last_access INTEGER NOT NULL, ltm_promoted INTEGER NOT NULL DEFAULT 0, ltm_point TEXT, ltm_category TEXT, decay_score REAL NOT NULL DEFAULT 1.0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_memory_stm_access ON memory_consolidation(stm_last_access);
CREATE INDEX IF NOT EXISTS idx_memory_decay ON memory_consolidation(decay_score);
CREATE TABLE IF NOT EXISTS dots (id TEXT PRIMARY KEY, name TEXT NOT NULL, character TEXT NOT NULL DEFAULT 'blue', role TEXT NOT NULL, description TEXT, system_prompt TEXT NOT NULL, model TEXT DEFAULT 'auto', tools TEXT NOT NULL DEFAULT '["terminal","vault","web_search","web_fetch"]', status TEXT NOT NULL DEFAULT 'idle', working_directory TEXT DEFAULT '/workspace', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS dot_messages (id TEXT PRIMARY KEY, dot_id TEXT NOT NULL REFERENCES dots(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, tool_calls TEXT, tool_call_id TEXT, tool_name TEXT, tool_args TEXT, tool_result TEXT, status TEXT DEFAULT 'done', created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dot_messages_dot ON dot_messages(dot_id);
CREATE INDEX IF NOT EXISTS idx_dot_messages_created ON dot_messages(created_at);
CREATE TABLE IF NOT EXISTS dot_spaces (id TEXT PRIMARY KEY, dot_id TEXT NOT NULL REFERENCES dots(id) ON DELETE CASCADE, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dot_spaces_dot ON dot_spaces(dot_id);
CREATE TABLE IF NOT EXISTS dot_tasks (id TEXT PRIMARY KEY, dot_id TEXT NOT NULL REFERENCES dots(id) ON DELETE CASCADE, prompt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', interval_seconds INTEGER, next_run_at INTEGER, last_run_at INTEGER, last_result TEXT, error TEXT, retry_count INTEGER NOT NULL DEFAULT 0, max_retries INTEGER NOT NULL DEFAULT 3, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_dot_tasks_dot ON dot_tasks(dot_id);
CREATE INDEX IF NOT EXISTS idx_dot_tasks_status ON dot_tasks(status);
CREATE INDEX IF NOT EXISTS idx_dot_tasks_next_run ON dot_tasks(next_run_at);
CREATE TABLE IF NOT EXISTS schema_versions (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL, checksum TEXT NOT NULL, execution_time_ms INTEGER NOT NULL);
INSERT OR IGNORE INTO schema_versions (version, name, applied_at, checksum, execution_time_ms) VALUES (1, '0001_baseline_drizzle_and_virtual_tables', strftime('%s','now')*1000, 'baseline', 0);
-- Idempotent column additions for chat_sessions, memories, chat_messages, dot_messages, dot_tasks
    `.trim(),
    up: (db: Database.Database) => {
      runBaseMigrations(db);
    },
  },
  {
    version: 2,
    name: "0002_add_schema_metadata_indexes",
    sql: `
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_study_logs_created ON study_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    `.trim(),
    up: (db: Database.Database) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_study_logs_created ON study_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
      `);
    },
  },
];

/**
 * Ensures the schema_versions table exists.
 */
export function ensureSchemaVersionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      execution_time_ms INTEGER NOT NULL
    );
  `);
}

/**
 * Computes deterministic checksum for a migration step name and version.
 */
export function computeMigrationChecksum(step: MigrationStep): string {
  return createHash("sha256")
    .update(`${step.version}:${step.name}:${step.sql || ""}`)
    .digest("hex");
}

/**
 * Creates a pre-migration snapshot backup of the database file.
 * Uses better-sqlite3's built-in backup API which is WAL-safe.
 */
export async function backupDatabaseBeforeMigrate(dbPath: string): Promise<string | null> {
  try {
    if (!fs.existsSync(dbPath)) return null;
    const backupDir = path.join(path.dirname(dbPath), "backups", "pre-migrate");
    fs.mkdirSync(backupDir, { recursive: true });
    const filename = `${path.basename(dbPath)}.pre-migrate-${Date.now()}.bak`;
    const dest = path.join(backupDir, filename);

    // Use better-sqlite3's built-in backup API which handles WAL correctly
    const src = new (require("better-sqlite3"))(dbPath);
    await src.backup(dest);
    src.close();

    return dest;
  } catch {
    return null;
  }
}

/**
 * Returns all recorded schema versions in ascending order.
 */
export function getAppliedVersions(db: Database.Database): SchemaVersionRecord[] {
  ensureSchemaVersionTable(db);
  const rows = db
    .prepare("SELECT version, name, applied_at, checksum, execution_time_ms FROM schema_versions ORDER BY version ASC")
    .all() as Array<{
      version: number;
      name: string;
      applied_at: number;
      checksum: string;
      execution_time_ms: number;
    }>;

  return rows.map((r) => ({
    version: r.version,
    name: r.name,
    appliedAt: r.applied_at,
    checksum: r.checksum,
    executionTimeMs: r.execution_time_ms,
  }));
}

/**
 * Returns the highest applied schema version, or 0 if none applied.
 */
export function getCurrentSchemaVersion(db: Database.Database): number {
  ensureSchemaVersionTable(db);
  const row = db.prepare("SELECT MAX(version) as max_version FROM schema_versions").get() as
    | { max_version: number | null }
    | undefined;
  return row?.max_version ?? 0;
}

/**
 * Verifies SQLite database integrity via PRAGMA integrity_check.
 */
export function verifySchemaIntegrity(db: Database.Database): boolean {
  try {
    const result = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
    if (!result || result.length === 0) return false;
    return result[0]?.integrity_check === "ok";
  } catch {
    return false;
  }
}

/**
 * Detects any recorded migration whose stored checksum no longer matches its
 * current source (content drift). Returns array of drifted versions.
 */
export function detectMigrationDrift(db: Database.Database): number[] {
  ensureSchemaVersionTable(db);
  const rows = db
    .prepare("SELECT version, name, checksum FROM schema_versions")
    .all() as Array<{ version: number; name: string; checksum: string }>;

  const drifted: number[] = [];
  for (const r of rows) {
    // Look up the migration step to get its SQL content for accurate checksum
    const step = MIGRATION_STEPS.find((s) => s.version === r.version);
    const expected = computeMigrationChecksum({
      version: r.version,
      name: r.name,
      sql: step?.sql,
    } as MigrationStep);
    if (r.checksum !== expected) {
      drifted.push(r.version);
    }
  }
  return drifted;
}

/**
 * Runs all pending migrations deterministically in version order.
 * Synchronous version for backward compatibility - does not create backup.
 */
export function runDeterministicMigrations(
  db: Database.Database,
): {
  appliedCount: number;
  currentVersion: number;
  backupPath?: string | null;
} {
  ensureSchemaVersionTable(db);

  const applied = new Set(getAppliedVersions(db).map((v) => v.version));
  let appliedCount = 0;

  for (const step of MIGRATION_STEPS) {
    if (applied.has(step.version)) continue;

    const start = Date.now();
    // Execute migration step
    step.up(db);
    const duration = Date.now() - start;

    const checksum = computeMigrationChecksum(step);
    db.prepare(`
      INSERT INTO schema_versions (version, name, applied_at, checksum, execution_time_ms)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(version) DO UPDATE SET
        checksum = excluded.checksum,
        execution_time_ms = excluded.execution_time_ms,
        applied_at = excluded.applied_at
    `).run(step.version, step.name, Date.now(), checksum, duration);

    appliedCount++;
  }

  return {
    appliedCount,
    currentVersion: getCurrentSchemaVersion(db),
    backupPath: null,
  };
}

/**
 * Runs all pending migrations with optional pre-migration backup.
 * Async version that supports WAL-safe backup.
 */
export async function runDeterministicMigrationsWithBackup(
  db: Database.Database,
  options?: {
    backup?: boolean;
    dbPath?: string;
  },
): Promise<{
  appliedCount: number;
  currentVersion: number;
  backupPath?: string | null;
}> {
  ensureSchemaVersionTable(db);

  let backupPath: string | null = null;
  if (options?.backup && options?.dbPath) {
    backupPath = await backupDatabaseBeforeMigrate(options.dbPath);
  }

  const applied = new Set(getAppliedVersions(db).map((v) => v.version));
  let appliedCount = 0;

  for (const step of MIGRATION_STEPS) {
    if (applied.has(step.version)) continue;

    const start = Date.now();
    // Execute migration step
    step.up(db);
    const duration = Date.now() - start;

    const checksum = computeMigrationChecksum(step);
    db.prepare(`
      INSERT INTO schema_versions (version, name, applied_at, checksum, execution_time_ms)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(version) DO UPDATE SET
        checksum = excluded.checksum,
        execution_time_ms = excluded.execution_time_ms,
        applied_at = excluded.applied_at
    `).run(step.version, step.name, Date.now(), checksum, duration);

    appliedCount++;
  }

  return {
    appliedCount,
    currentVersion: getCurrentSchemaVersion(db),
    backupPath,
  };
}
