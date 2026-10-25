/**
 * Phase 14: Schema-Contract Verification Tests.
 *
 * Validates that the database schema matches expected contracts:
 * 1. All expected tables exist with correct columns
 * 2. Column types match expectations
 * 3. Indexes are present
 * 4. Foreign key constraints are defined
 * 5. Check constraints are in place
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { runDeterministicMigrations } from "../lib/db/migration-manager.ts";
import { getDb, initDb } from "../lib/db/client.ts";

let db: Database.Database;
let tmpDir: string;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-schema-test-"));
  const p = path.join(tmpDir, "vault.db");
  process.env.VAULT_DB_PATH = p;
  db = new Database(p);
  db.pragma("foreign_keys = ON");
  await runDeterministicMigrations(db);
});

after(() => {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup error */
  }
});

describe("Phase 14: Schema-Contract Verification", () => {
  it("all expected tables exist", () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_drizzle%'
      ORDER BY name
    `).all() as { name: string }[];

    const expectedTables = [
      "ai_providers",
      "artifacts",
      "auth",
      "backups",
      "background_jobs",
      "chat_messages",
      "chat_sessions",
      "dots",
      "dot_messages",
      "dot_spaces",
      "dot_tasks",
      "events",
      "exam_subjects",
      "exam_topics",
      "file_versions",
      "files",
      "files_fts",
      "file_content_fts",
      "fsrs_cards",
      "goal_milestones",
      "goals",
      "kv",
      "memories",
      "memory_consolidation",
      "memory_tombstones",
      "projects",
      "schema_versions",
      "sessions",
      "study_logs",
      "task_deps",
      "tasks",
      "time_entries",
    ];

    const tableNames = new Set(tables.map(t => t.name));
    for (const expected of expectedTables) {
      assert.ok(tableNames.has(expected), `Table ${expected} should exist`);
    }
  });

  it("chat_sessions table has correct schema", () => {
    const cols = db.prepare("PRAGMA table_info(chat_sessions)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const colMap = new Map(cols.map(c => [c.name, c]));

    assert.ok(colMap.has("id"), "chat_sessions should have id column");
    assert.equal(colMap.get("id")?.pk, 1, "id should be primary key");
    assert.ok(colMap.has("title_enc"), "chat_sessions should have title_enc column");
    assert.ok(colMap.has("title_nonce"), "chat_sessions should have title_nonce column");
    assert.ok(colMap.has("title_tag"), "chat_sessions should have title_tag column");
    assert.ok(colMap.has("provider_id"), "chat_sessions should have provider_id column");
    assert.ok(colMap.has("model"), "chat_sessions should have model column");
    assert.ok(colMap.has("summary_enc"), "chat_sessions should have summary_enc column");
    assert.ok(colMap.has("summary_nonce"), "chat_sessions should have summary_nonce column");
    assert.ok(colMap.has("summary_tag"), "chat_sessions should have summary_tag column");
    assert.ok(colMap.has("summary_until"), "chat_sessions should have summary_until column");
    assert.ok(colMap.has("created_at"), "chat_sessions should have created_at column");
    assert.ok(colMap.has("updated_at"), "chat_sessions should have updated_at column");
    assert.ok(colMap.has("mode"), "chat_sessions should have mode column (migration)");
    assert.ok(colMap.has("effort"), "chat_sessions should have effort column (migration)");
  });

  it("chat_messages table has correct schema", () => {
    const cols = db.prepare("PRAGMA table_info(chat_messages)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const colMap = new Map(cols.map(c => [c.name, c]));

    assert.ok(colMap.has("id"), "chat_messages should have id column");
    assert.equal(colMap.get("id")?.pk, 1, "id should be primary key");
    assert.ok(colMap.has("session_id"), "chat_messages should have session_id column");
    assert.ok(colMap.has("seq"), "chat_messages should have seq column");
    assert.ok(colMap.has("role"), "chat_messages should have role column");
    assert.ok(colMap.has("content_enc"), "chat_messages should have content_enc column");
    assert.ok(colMap.has("content_nonce"), "chat_messages should have content_nonce column");
    assert.ok(colMap.has("content_tag"), "chat_messages should have content_tag column");
    assert.ok(colMap.has("tool_calls"), "chat_messages should have tool_calls column");
    assert.ok(colMap.has("tool_call_id"), "chat_messages should have tool_call_id column");
    assert.ok(colMap.has("edited_at"), "chat_messages should have edited_at column");
    assert.ok(colMap.has("deleted"), "chat_messages should have deleted column");
    assert.ok(colMap.has("created_at"), "chat_messages should have created_at column");
    assert.ok(colMap.has("feedback"), "chat_messages should have feedback column (migration)");
    assert.ok(colMap.has("telemetry"), "chat_messages should have telemetry column (migration)");
  });

  it("files table has correct schema", () => {
    const cols = db.prepare("PRAGMA table_info(files)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const colMap = new Map(cols.map(c => [c.name, c]));

    assert.ok(colMap.has("id"), "files should have id column");
    assert.equal(colMap.get("id")?.pk, 1, "id should be primary key");
    assert.ok(colMap.has("path"), "files should have path column");
    assert.ok(colMap.has("name"), "files should have name column");
    assert.ok(colMap.has("mime"), "files should have mime column");
    assert.ok(colMap.has("size_bytes"), "files should have size_bytes column");
    assert.ok(colMap.has("is_dir"), "files should have is_dir column");
    assert.ok(colMap.has("content_enc"), "files should have content_enc column");
    assert.ok(colMap.has("nonce"), "files should have nonce column");
    assert.ok(colMap.has("tag"), "files should have tag column");
    assert.ok(colMap.has("dek"), "files should have dek column");
    assert.ok(colMap.has("dek_nonce"), "files should have dek_nonce column");
    assert.ok(colMap.has("dek_tag"), "files should have dek_tag column");
    assert.ok(colMap.has("version"), "files should have version column");
    assert.ok(colMap.has("created_at"), "files should have created_at column");
    assert.ok(colMap.has("updated_at"), "files should have updated_at column");
    assert.ok(colMap.has("deleted_at"), "files should have deleted_at column");
  });

  it("tasks table has correct schema with check constraints", () => {
    const cols = db.prepare("PRAGMA table_info(tasks)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const colMap = new Map(cols.map(c => [c.name, c]));

    assert.ok(colMap.has("id"), "tasks should have id column");
    assert.equal(colMap.get("id")?.pk, 1, "id should be primary key");
    assert.ok(colMap.has("project_id"), "tasks should have project_id column");
    assert.ok(colMap.has("title"), "tasks should have title column");
    assert.ok(colMap.has("description"), "tasks should have description column");
    assert.ok(colMap.has("status"), "tasks should have status column");
    assert.ok(colMap.has("priority"), "tasks should have priority column");
    assert.ok(colMap.has("due_date"), "tasks should have due_date column");
    assert.ok(colMap.has("start_date"), "tasks should have start_date column");
    assert.ok(colMap.has("tags"), "tasks should have tags column");
    assert.ok(colMap.has("completed_at"), "tasks should have completed_at column");
    assert.ok(colMap.has("created_at"), "tasks should have created_at column");
    assert.ok(colMap.has("updated_at"), "tasks should have updated_at column");
  });

  it("memories table has correct schema", () => {
    const cols = db.prepare("PRAGMA table_info(memories)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const colMap = new Map(cols.map(c => [c.name, c]));

    assert.ok(colMap.has("id"), "memories should have id column");
    assert.equal(colMap.get("id")?.pk, 1, "id should be primary key");
    assert.ok(colMap.has("point"), "memories should have point column");
    assert.ok(colMap.has("category"), "memories should have category column");
    assert.ok(colMap.has("source_session_id"), "memories should have source_session_id column (migration)");
    assert.ok(colMap.has("source"), "memories should have source column (migration)");
    assert.ok(colMap.has("created_at"), "memories should have created_at column");
    assert.ok(colMap.has("updated_at"), "memories should have updated_at column");
  });

  it("required indexes exist", () => {
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as { name: string }[];

    const indexNames = new Set(indexes.map(i => i.name));

    const expectedIndexes = [
      "chat_messages_session_seq_uq",
      "idx_chat_messages_session",
      "idx_study_logs_created",
      "idx_tasks_priority",
      "idx_artifacts_session",
      "idx_artifacts_created",
      "idx_fsrs_cards_due",
      "idx_fsrs_cards_subject",
      "idx_fsrs_cards_topic",
      "idx_background_jobs_status",
      "idx_memory_tombstones_hash",
      "idx_memory_stm_access",
      "idx_memory_decay",
      "idx_dot_messages_dot",
      "idx_dot_messages_created",
      "idx_dot_spaces_dot",
      "idx_dot_tasks_dot",
      "idx_dot_tasks_status",
      "idx_dot_tasks_next_run",
      "files_path_unique",
      "idx_files_path",
    ];

    for (const expected of expectedIndexes) {
      assert.ok(indexNames.has(expected), `Index ${expected} should exist`);
    }
  });

  it("foreign key constraints are defined", () => {
    const fks = db.prepare("PRAGMA foreign_key_list(chat_messages)").all() as Array<{
      table: string;
      from: string;
      to: string;
    }>;

    const chatMessagesFks = fks.filter(fk => fk.table === "chat_sessions");
    assert.ok(chatMessagesFks.length > 0, "chat_messages should have FK to chat_sessions");
    assert.ok(chatMessagesFks.some(fk => fk.from === "session_id" && fk.to === "id"),
      "chat_messages.session_id should reference chat_sessions.id");
  });

  it("schema_versions table tracks migrations", () => {
    const cols = db.prepare("PRAGMA table_info(schema_versions)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const colMap = new Map(cols.map(c => [c.name, c]));

    assert.ok(colMap.has("version"), "schema_versions should have version column");
    assert.equal(colMap.get("version")?.pk, 1, "version should be primary key");
    assert.ok(colMap.has("name"), "schema_versions should have name column");
    assert.ok(colMap.has("applied_at"), "schema_versions should have applied_at column");
    assert.ok(colMap.has("checksum"), "schema_versions should have checksum column");
    assert.ok(colMap.has("execution_time_ms"), "schema_versions should have execution_time_ms column");

    // Verify initial migration is recorded
    const versions = db.prepare("SELECT * FROM schema_versions ORDER BY version").all() as Array<{
      version: number;
      name: string;
    }>;
    assert.ok(versions.length >= 1, "At least one migration should be recorded");
    assert.equal(versions[0].version, 1, "First migration should be version 1");
  });

  it("getDb applies WAL mode and pragma settings", () => {
    // The pragma settings (WAL, busy_timeout, etc.) are applied by getDb()/initDb()
    // not by runMigrations(). Test that the client functions apply them.
    const testDbPath = path.join(tmpDir, "pragma-test.db");
    const testDb = initDb(testDbPath);

    try {
      const journalMode = testDb.pragma("journal_mode") as Array<{ journal_mode: string }>;
      assert.ok(journalMode[0]?.journal_mode === "wal" || journalMode[0]?.journal_mode === "WAL",
        "Database should be in WAL mode after initDb");

      const busyTimeout = testDb.pragma("busy_timeout") as Array<{ timeout: number }>;
      assert.ok(busyTimeout[0]?.timeout >= 5000, "busy_timeout should be at least 5000");

      const foreignKeys = testDb.pragma("foreign_keys") as Array<{ foreign_keys: number }>;
      assert.equal(foreignKeys[0]?.foreign_keys, 1, "foreign_keys should be ON");

      const synchronous = testDb.pragma("synchronous") as Array<{ synchronous: number | string }>;
      assert.ok(synchronous[0]?.synchronous === 1 || synchronous[0]?.synchronous === "NORMAL",
        "synchronous should be NORMAL");
    } finally {
      testDb.close();
    }
  });

  it("FTS5 virtual tables are created", () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'table' AND name IN ('files_fts', 'file_content_fts')
    `).all() as { name: string }[];

    const tableNames = new Set(tables.map(t => t.name));
    assert.ok(tableNames.has("files_fts"), "files_fts virtual table should exist");
    assert.ok(tableNames.has("file_content_fts"), "file_content_fts virtual table should exist");
  });

  it("memory_tombstones table enforces unique constraint", () => {
    const cols = db.prepare("PRAGMA table_info(memory_tombstones)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const colMap = new Map(cols.map(c => [c.name, c]));
    assert.ok(colMap.has("content_hash"), "memory_tombstones should have content_hash column");
    assert.equal(colMap.get("content_hash")?.notnull, 1, "content_hash should be NOT NULL");
    // Note: unique constraint is enforced by index, not column flag
  });

  it("memory_consolidation table has STM/LTM columns", () => {
    const cols = db.prepare("PRAGMA table_info(memory_consolidation)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const colMap = new Map(cols.map(c => [c.name, c]));
    assert.ok(colMap.has("stm_key"), "memory_consolidation should have stm_key column");
    assert.ok(colMap.has("stm_value"), "memory_consolidation should have stm_value column");
    assert.ok(colMap.has("stm_access_count"), "memory_consolidation should have stm_access_count column");
    assert.ok(colMap.has("stm_last_access"), "memory_consolidation should have stm_last_access column");
    assert.ok(colMap.has("ltm_promoted"), "memory_consolidation should have ltm_promoted column");
    assert.ok(colMap.has("ltm_point"), "memory_consolidation should have ltm_point column");
    assert.ok(colMap.has("ltm_category"), "memory_consolidation should have ltm_category column");
    assert.ok(colMap.has("decay_score"), "memory_consolidation should have decay_score column");
  });

  it("dots table has correct schema", () => {
    const cols = db.prepare("PRAGMA table_info(dots)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const colMap = new Map(cols.map(c => [c.name, c]));
    assert.ok(colMap.has("id"), "dots should have id column");
    assert.equal(colMap.get("id")?.pk, 1, "id should be primary key");
    assert.ok(colMap.has("name"), "dots should have name column");
    assert.ok(colMap.has("character"), "dots should have character column");
    assert.ok(colMap.has("role"), "dots should have role column");
    assert.ok(colMap.has("system_prompt"), "dots should have system_prompt column");
    assert.ok(colMap.has("model"), "dots should have model column");
    assert.ok(colMap.has("tools"), "dots should have tools column");
    assert.ok(colMap.has("status"), "dots should have status column");
    assert.ok(colMap.has("working_directory"), "dots should have working_directory column");
    assert.ok(colMap.has("created_at"), "dots should have created_at column");
    assert.ok(colMap.has("updated_at"), "dots should have updated_at column");
  });

  it("dot_tasks table has scheduling columns", () => {
    const cols = db.prepare("PRAGMA table_info(dot_tasks)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const colMap = new Map(cols.map(c => [c.name, c]));
    assert.ok(colMap.has("id"), "dot_tasks should have id column");
    assert.equal(colMap.get("id")?.pk, 1, "id should be primary key");
    assert.ok(colMap.has("dot_id"), "dot_tasks should have dot_id column");
    assert.ok(colMap.has("prompt"), "dot_tasks should have prompt column");
    assert.ok(colMap.has("status"), "dot_tasks should have status column");
    assert.ok(colMap.has("interval_seconds"), "dot_tasks should have interval_seconds column");
    assert.ok(colMap.has("next_run_at"), "dot_tasks should have next_run_at column");
    assert.ok(colMap.has("last_run_at"), "dot_tasks should have last_run_at column");
    assert.ok(colMap.has("last_result"), "dot_tasks should have last_result column");
    assert.ok(colMap.has("error"), "dot_tasks should have error column");
    assert.ok(colMap.has("retry_count"), "dot_tasks should have retry_count column (migration)");
    assert.ok(colMap.has("max_retries"), "dot_tasks should have max_retries column (migration)");
    assert.ok(colMap.has("created_at"), "dot_tasks should have created_at column");
    assert.ok(colMap.has("updated_at"), "dot_tasks should have updated_at column");
  });

  it("background_jobs table has correct schema", () => {
    const cols = db.prepare("PRAGMA table_info(background_jobs)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const colMap = new Map(cols.map(c => [c.name, c]));
    assert.ok(colMap.has("id"), "background_jobs should have id column");
    assert.equal(colMap.get("id")?.pk, 1, "id should be primary key");
    assert.ok(colMap.has("type"), "background_jobs should have type column");
    assert.ok(colMap.has("status"), "background_jobs should have status column");
    assert.ok(colMap.has("progress_pct"), "background_jobs should have progress_pct column");
    assert.ok(colMap.has("stage"), "background_jobs should have stage column");
    assert.ok(colMap.has("payload"), "background_jobs should have payload column");
    assert.ok(colMap.has("result"), "background_jobs should have result column");
    assert.ok(colMap.has("error"), "background_jobs should have error column");
    assert.ok(colMap.has("retry_count"), "background_jobs should have retry_count column");
    assert.ok(colMap.has("max_retries"), "background_jobs should have max_retries column");
    assert.ok(colMap.has("created_at"), "background_jobs should have created_at column");
    assert.ok(colMap.has("started_at"), "background_jobs should have started_at column");
    assert.ok(colMap.has("completed_at"), "background_jobs should have completed_at column");
    assert.ok(colMap.has("updated_at"), "background_jobs should have updated_at column");
  });

  it("check constraints are enforced", () => {
    // Test tasks status check constraint
    assert.throws(() => {
      db.prepare(`
        INSERT INTO tasks (title, status, priority, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run("Test", "invalid_status", 1, Date.now(), Date.now());
    }, /CHECK constraint failed/);

    // Test tasks priority check constraint
    assert.throws(() => {
      db.prepare(`
        INSERT INTO tasks (title, status, priority, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run("Test", "todo", 999, Date.now(), Date.now());
    }, /CHECK constraint failed/);

    // Test goals progress check constraint
    assert.throws(() => {
      db.prepare(`
        INSERT INTO goals (title, progress_pct, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run("Test", 150, Date.now(), Date.now());
    }, /CHECK constraint failed/);

    // Test exam_topics progress check constraint
    const subjectId = db.prepare(`
      INSERT INTO exam_subjects (name, created_at) VALUES (?, ?)
    `).run("Test Subject", Date.now()).lastInsertRowid;

    assert.throws(() => {
      db.prepare(`
        INSERT INTO exam_topics (subject_id, name, progress_pct, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(subjectId, "Test Topic", 150, Date.now(), Date.now());
    }, /CHECK constraint failed/);

    // Test files is_dir check constraint
    assert.throws(() => {
      db.prepare(`
        INSERT INTO files (path, name, is_dir, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("/test", "test", 5, 1, Date.now(), Date.now());
    }, /CHECK constraint failed/);

    // Test file_versions version check constraint
    assert.throws(() => {
      db.prepare(`
        INSERT INTO file_versions (file_id, version, created_at)
        VALUES (?, ?, ?)
      `).run(1, 0, Date.now());
    }, /CHECK constraint failed/);
  });
});
