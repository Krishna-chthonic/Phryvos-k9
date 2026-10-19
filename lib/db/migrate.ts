/**
 * Database migrations and virtual/special table initialization.
 *
 * Importers/callers: lib/db/client.ts (runMigrations)
 * Affected API: All vault database tables.
 * Data schemas if any: memories table (id, point, category, created_at, updated_at).
 * User instruction verbatim: "3. ek memmory system bhi hona chahiye ai ke liye jisme vo points bana ke chijo ko permanentlt yaad rakhe jinko users khud se kahe ki ye chij yaad rakhna ya permanently save kar lo"
 */
import path from "node:path";
import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * Apply drizzle SQL migrations (idempotent via the _drizzle_migrations table),
 * then create FTS5 virtual tables that drizzle-kit does not emit.
 */
export function runMigrations(db: Database.Database): void {
  const folder = path.resolve(process.cwd(), "drizzle");
  migrate(drizzle(db), { migrationsFolder: folder });
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(name, path);
    CREATE VIRTUAL TABLE IF NOT EXISTS file_content_fts USING fts5(file_id UNINDEXED, body);
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      point TEXT NOT NULL,
      category TEXT DEFAULT 'fact',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fsrs_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES exam_subjects(id) ON DELETE CASCADE,
      topic_id INTEGER REFERENCES exam_topics(id) ON DELETE SET NULL,
      due INTEGER NOT NULL,
      stability REAL NOT NULL DEFAULT 0,
      difficulty REAL NOT NULL DEFAULT 0,
      elapsed_days INTEGER NOT NULL DEFAULT 0,
      scheduled_days REAL NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      state INTEGER NOT NULL DEFAULT 0,
      last_review INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fsrs_cards_due ON fsrs_cards(due);
    CREATE INDEX IF NOT EXISTS idx_fsrs_cards_subject ON fsrs_cards(subject_id);
    CREATE INDEX IF NOT EXISTS idx_fsrs_cards_topic ON fsrs_cards(topic_id);
    CREATE TABLE IF NOT EXISTS background_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      progress_pct INTEGER NOT NULL DEFAULT 0,
      stage TEXT,
      payload TEXT,
      result TEXT,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status);
    CREATE TABLE IF NOT EXISTS memory_tombstones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_hash TEXT UNIQUE NOT NULL,
      deleted_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_tombstones_hash ON memory_tombstones(content_hash);
    CREATE TABLE IF NOT EXISTS schema_versions (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      execution_time_ms INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO schema_versions (version, name, applied_at, checksum, execution_time_ms)
    VALUES (1, '0001_baseline_drizzle_and_virtual_tables', strftime('%s','now')*1000, 'baseline', 0);
  `);
  // The vault root is a materialized directory row (vault-service relies on it).
  db.prepare(
    "INSERT OR IGNORE INTO files (path, name, is_dir, version, created_at, updated_at) VALUES ('/', '/', 1, 1, strftime('%s','now')*1000, strftime('%s','now')*1000)",
  ).run();
}
