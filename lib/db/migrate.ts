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
      source_session_id TEXT,
      source TEXT DEFAULT 'user',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      message_id TEXT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_at);
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
    CREATE TABLE IF NOT EXISTS memory_consolidation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stm_key TEXT UNIQUE NOT NULL,
      stm_value TEXT NOT NULL,
      stm_access_count INTEGER NOT NULL DEFAULT 0,
      stm_last_access INTEGER NOT NULL,
      ltm_promoted INTEGER NOT NULL DEFAULT 0,
      ltm_point TEXT,
      ltm_category TEXT,
      decay_score REAL NOT NULL DEFAULT 1.0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_stm_access ON memory_consolidation(stm_last_access);
    CREATE INDEX IF NOT EXISTS idx_memory_decay ON memory_consolidation(decay_score);
    CREATE TABLE IF NOT EXISTS dots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      character TEXT NOT NULL DEFAULT 'blue',
      role TEXT NOT NULL,
      description TEXT,
      system_prompt TEXT NOT NULL,
      model TEXT DEFAULT 'auto',
      tools TEXT NOT NULL DEFAULT '["terminal","vault","web_search","web_fetch"]',
      status TEXT NOT NULL DEFAULT 'idle',
      working_directory TEXT DEFAULT '/workspace',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dot_messages (
      id TEXT PRIMARY KEY,
      dot_id TEXT NOT NULL REFERENCES dots(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      tool_args TEXT,
      tool_result TEXT,
      status TEXT DEFAULT 'done',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dot_messages_dot ON dot_messages(dot_id);
    CREATE INDEX IF NOT EXISTS idx_dot_messages_created ON dot_messages(created_at);
    CREATE TABLE IF NOT EXISTS dot_spaces (
      id TEXT PRIMARY KEY,
      dot_id TEXT NOT NULL REFERENCES dots(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dot_spaces_dot ON dot_spaces(dot_id);
    CREATE TABLE IF NOT EXISTS dot_tasks (
      id TEXT PRIMARY KEY,
      dot_id TEXT NOT NULL REFERENCES dots(id) ON DELETE CASCADE,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      interval_seconds INTEGER,
      next_run_at INTEGER,
      last_run_at INTEGER,
      last_result TEXT,
      error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dot_tasks_dot ON dot_tasks(dot_id);
    CREATE INDEX IF NOT EXISTS idx_dot_tasks_status ON dot_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_dot_tasks_next_run ON dot_tasks(next_run_at);
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

  // Ensure columns on chat_sessions exist (idempotent migration)
  try {
    const sessionCols = (db.prepare("PRAGMA table_info(chat_sessions)").all() as Array<{ name: string }>).map((c) => c.name);
    if (!sessionCols.includes("mode")) {
      db.exec("ALTER TABLE chat_sessions ADD COLUMN mode TEXT;");
    }
    if (!sessionCols.includes("effort")) {
      db.exec("ALTER TABLE chat_sessions ADD COLUMN effort TEXT;");
    }
  } catch {}

  // Ensure columns on memories exist (idempotent migration)
  try {
    const memCols = (db.prepare("PRAGMA table_info(memories)").all() as Array<{ name: string }>).map((c) => c.name);
    if (!memCols.includes("source_session_id")) {
      db.exec("ALTER TABLE memories ADD COLUMN source_session_id TEXT;");
    }
    if (!memCols.includes("source")) {
      db.exec("ALTER TABLE memories ADD COLUMN source TEXT DEFAULT 'user';");
    }
  } catch {}

  // Ensure columns on chat_messages exist (idempotent migration for CHAT-55 & feedback)
  try {
    const msgCols = (db.prepare("PRAGMA table_info(chat_messages)").all() as Array<{ name: string }>).map((c) => c.name);
    if (!msgCols.includes("feedback")) {
      db.exec("ALTER TABLE chat_messages ADD COLUMN feedback TEXT;");
    }
    if (!msgCols.includes("telemetry")) {
      db.exec("ALTER TABLE chat_messages ADD COLUMN telemetry TEXT;");
    }
  } catch {}

  try {
    const dotMsgCols = (db.prepare("PRAGMA table_info(dot_messages)").all() as Array<{ name: string }>).map((c) => c.name);
    if (!dotMsgCols.includes("tool_calls")) {
      db.exec("ALTER TABLE dot_messages ADD COLUMN tool_calls TEXT;");
    }
    if (!dotMsgCols.includes("tool_call_id")) {
      db.exec("ALTER TABLE dot_messages ADD COLUMN tool_call_id TEXT;");
    }
  } catch {}

  try {
    const taskCols = (db.prepare("PRAGMA table_info(dot_tasks)").all() as Array<{ name: string }>).map((c) => c.name);
    if (!taskCols.includes("retry_count")) {
      db.exec("ALTER TABLE dot_tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;");
    }
    if (!taskCols.includes("max_retries")) {
      db.exec("ALTER TABLE dot_tasks ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3;");
    }
  } catch {}

  // Default seed the 4 specialist Dots if table is empty
  const dotCount = (db.prepare("SELECT COUNT(*) as count FROM dots").get() as { count: number }).count;
  if (dotCount === 0) {
    const now = Date.now();
    const insertDot = db.prepare(`
      INSERT INTO dots (id, name, character, role, description, system_prompt, model, tools, status, working_directory, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertDot.run(
      "neo",
      "Neo",
      "blue",
      "Lead Software Engineer",
      "Specialist in bash commands, code architecture, git automation, and debugging.",
      "You are Neo, an always-on AI software coworker in Phryvos-K9. You have terminal access, file system tools, and deep code engineering capabilities. You write modular, clean code, verify your changes, and provide clear progress updates.",
      "auto",
      JSON.stringify(["terminal", "vault", "web_search", "web_fetch"]),
      "idle",
      "/root/phryvos-k9",
      now,
      now
    );

    insertDot.run(
      "nova",
      "Nova",
      "mint",
      "Autonomous Deep Researcher",
      "Specialist in autonomous web investigation, cross-verifying citations, and synthesizing comprehensive dossiers.",
      "You are Nova, an always-on AI researcher coworker in Phryvos-K9. You investigate complex inquiries across multiple angles, browse authoritative sources, and save thorough research dossiers to the vault.",
      "auto",
      JSON.stringify(["vault", "web_search", "web_fetch"]),
      "idle",
      "/vault/research",
      now,
      now
    );

    insertDot.run(
      "atlas",
      "Atlas",
      "orange",
      "Vault Scribe & Operations",
      "Specialist in organizing vault notes, structuring projects, managing daily priorities, and knowledge synthesis.",
      "You are Atlas, an always-on AI operations coworker in Phryvos-K9. You manage vault documents, prioritize tasks, organize notes, and maintain structured workflows.",
      "auto",
      JSON.stringify(["vault", "tasks", "projects"]),
      "idle",
      "/vault",
      now,
      now
    );

    insertDot.run(
      "socrates",
      "Socrates",
      "purple",
      "Exam & Socratic Tutor",
      "Specialist in deep conceptual coaching, mathematical derivations, Socratic dialogues, and exam prep.",
      "You are Socrates, an always-on AI tutor coworker in Phryvos-K9. You guide learners through first-principles explanations, test understanding with targeted questions, and simplify complex derivations.",
      "auto",
      JSON.stringify(["vault", "web_search", "python_runner"]),
      "idle",
      "/vault/study",
      now,
      now
    );
  }

  // Seed default autonomous standing tasks if dot_tasks table is empty
  const taskCount = (db.prepare("SELECT COUNT(*) as count FROM dot_tasks").get() as { count: number }).count;
  if (taskCount === 0) {
    const now = Date.now();
    const insertTask = db.prepare(`
      INSERT INTO dot_tasks (id, dot_id, prompt, status, interval_seconds, next_run_at, last_run_at, last_result, error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertTask.run(
      "task_neo_health",
      "neo",
      "Inspect repository git status, check uncommitted changes, and verify project build health.",
      "queued",
      7200, // Every 2 hours
      now + 7200000,
      null,
      null,
      null,
      now,
      now
    );

    insertTask.run(
      "task_nova_research",
      "nova",
      "Search the web for major open-source AI and software developments from the past 24 hours, and draft a brief summary.",
      "queued",
      86400, // Daily (every 24 hours)
      now + 86400000,
      null,
      null,
      null,
      now,
      now
    );

    insertTask.run(
      "task_atlas_tasks",
      "atlas",
      "Review upcoming vault tasks, check deadlines, and summarize daily priorities.",
      "queued",
      21600, // Every 6 hours
      now + 21600000,
      null,
      null,
      null,
      now,
      now
    );
  }
  // The vault root is a materialized directory row (vault-service relies on it).
  db.prepare(
    "INSERT OR IGNORE INTO files (path, name, is_dir, version, created_at, updated_at) VALUES ('/', '/', 1, 1, strftime('%s','now')*1000, strftime('%s','now')*1000)",
  ).run();
}
