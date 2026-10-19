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
    up: (db: Database.Database) => {
      runBaseMigrations(db);
    },
  },
  {
    version: 2,
    name: "0002_add_schema_metadata_indexes",
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
  return createHash("sha256").update(`${step.version}:${step.name}`).digest("hex");
}

/**
 * Creates a pre-migration snapshot backup of the database file.
 */
export function backupDatabaseBeforeMigrate(dbPath: string): string | null {
  try {
    if (!fs.existsSync(dbPath)) return null;
    const backupDir = path.join(path.dirname(dbPath), "backups", "pre-migrate");
    fs.mkdirSync(backupDir, { recursive: true });
    const filename = `${path.basename(dbPath)}.pre-migrate-${Date.now()}.bak`;
    const dest = path.join(backupDir, filename);
    fs.copyFileSync(dbPath, dest);
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
 * Runs all pending migrations deterministically in version order.
 */
export function runDeterministicMigrations(
  db: Database.Database,
  options?: {
    backup?: boolean;
    dbPath?: string;
  },
): {
  appliedCount: number;
  currentVersion: number;
  backupPath?: string | null;
} {
  ensureSchemaVersionTable(db);

  let backupPath: string | null = null;
  if (options?.backup && options?.dbPath) {
    backupPath = backupDatabaseBeforeMigrate(options.dbPath);
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
