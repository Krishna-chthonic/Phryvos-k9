import { sql } from "drizzle-orm";
import { blob, check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// phryvos k9 — full vault schema. All timestamps are INTEGER UTC milliseconds.

export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at"),
});

export const auth = sqliteTable("auth", {
  id: integer("id").primaryKey(),
  kdf: text("kdf").notNull(),
  salt: blob("salt").notNull(),
  verifier: blob("verifier").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const files = sqliteTable(
  "files",
  {
    id: integer("id").primaryKey(),
    path: text("path").unique().notNull(), // '/notes/todo.md'; dirs materialized as is_dir=1 rows
    name: text("name").notNull(),
    mime: text("mime"),
    sizeBytes: integer("size_bytes"),
    isDir: integer("is_dir", { mode: "boolean" }).notNull().default(false),
    // AES-256-GCM envelope: content encrypted under per-file DEK, DEK wrapped under master key
    contentEnc: blob("content_enc"),
    nonce: blob("nonce"),
    tag: blob("tag"),
    dek: blob("dek"),
    dekNonce: blob("dek_nonce"),
    dekTag: blob("dek_tag"),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at"),
    updatedAt: integer("updated_at"),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    index("idx_files_path").on(t.path),
    check("files_is_dir_chk", sql`is_dir IN (0,1)`),
    check("files_version_chk", sql`version >= 1`),
  ],
);

// FTS5 virtual tables (created in lib/db/migrate.ts, managed manually by vault-service)
// files_fts(name, path) — name/full-path search
// file_content_fts(file_id UNINDEXED, body) — plaintext FTS for text files (documented local tradeoff)

export const fileVersions = sqliteTable(
  "file_versions",
  {
    id: integer("id").primaryKey(),
    fileId: integer("file_id")
      .notNull()
      .references(() => files.id),
    version: integer("version").notNull(),
    note: text("note"),
    createdAt: integer("created_at").notNull(),
    contentEnc: blob("content_enc"),
    nonce: blob("nonce"),
    tag: blob("tag"),
    dek: blob("dek"),
    dekNonce: blob("dek_nonce"),
    dekTag: blob("dek_tag"),
  },
  (t) => [
    uniqueIndex("file_versions_file_version_uq").on(t.fileId, t.version),
    check("file_versions_version_chk", sql`version >= 1`),
  ],
);

export const aiProviders = sqliteTable(
  "ai_providers",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    // 'openai' = any OpenAI-compatible endpoint (custom providers); 'anthropic' = Anthropic wire format
    kind: text("kind", { enum: ["openai", "anthropic"] }).notNull(),
    baseUrl: text("base_url").notNull(),
    // API key encrypted with the vault master key
    apiKey: blob("api_key"),
    keyNonce: blob("key_nonce"),
    keyTag: blob("key_tag"),
    models: text("models"), // JSON array of model ids
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [check("ai_providers_kind_chk", sql`kind IN ('openai','anthropic')`)],
);

export const chatSessions = sqliteTable("chat_sessions", {
  id: text("id").primaryKey(), // cuid
  titleEnc: blob("title_enc"),
  titleNonce: blob("title_nonce"),
  titleTag: blob("title_tag"),
  providerId: integer("provider_id").references(() => aiProviders.id),
  model: text("model").notNull(),
  mode: text("mode"),
  effort: text("effort"),
  summaryEnc: blob("summary_enc"),
  summaryNonce: blob("summary_nonce"),
  summaryTag: blob("summary_tag"),
  summaryUntil: integer("summary_until").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(), // cuid
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id),
    seq: integer("seq").notNull(),
    role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
    contentEnc: blob("content_enc"),
    contentNonce: blob("content_nonce"),
    contentTag: blob("content_tag"),
    // assistant: JSON [{id, name, args, result?, approved?}]
    toolCalls: text("tool_calls"),
    toolCallId: text("tool_call_id"),
    editedAt: integer("edited_at"),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
    feedback: text("feedback"), // 'helpful' | 'unhelpful' | null
    telemetry: text("telemetry"), // JSON string of TurnTelemetry
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("chat_messages_session_seq_uq").on(t.sessionId, t.seq),
    index("idx_chat_messages_session").on(t.sessionId),
    check("chat_messages_role_chk", sql`role IN ('user','assistant','tool')`),
    check("chat_messages_seq_chk", sql`seq >= 0`),
  ],
);

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  color: text("color"),
  status: text("status").notNull().default("active"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id").primaryKey(),
    projectId: integer("project_id").references(() => projects.id),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("todo"),
    priority: integer("priority").notNull().default(1),
    dueDate: text("due_date"),
    startDate: text("start_date"), // feeds Gantt bars
    tags: text("tags"), // JSON array
    completedAt: integer("completed_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_tasks_project").on(t.projectId),
    index("idx_tasks_status").on(t.status),
    check("tasks_status_chk", sql`status IN ('todo','doing','done')`),
    check("tasks_priority_chk", sql`priority BETWEEN 0 AND 3`),
  ],
);

export const taskDeps = sqliteTable(
  "task_deps",
  {
    id: integer("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id),
    blocksTaskId: integer("blocks_task_id")
      .notNull()
      .references(() => tasks.id),
  },
  (t) => [uniqueIndex("task_deps_pair_uq").on(t.taskId, t.blocksTaskId)],
);

export const timeEntries = sqliteTable("time_entries", {
  id: integer("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id),
  projectId: integer("project_id").references(() => projects.id),
  startedAt: integer("started_at").notNull(),
  durationSec: integer("duration_sec").notNull(),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
});

export const examSubjects = sqliteTable("exam_subjects", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  targetDate: text("target_date"),
  color: text("color"),
  createdAt: integer("created_at").notNull(),
});

export const examTopics = sqliteTable(
  "exam_topics",
  {
    id: integer("id").primaryKey(),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => examSubjects.id),
    name: text("name").notNull(),
    progressPct: integer("progress_pct").notNull().default(0),
    dueDate: text("due_date"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [check("exam_topics_progress_chk", sql`progress_pct BETWEEN 0 AND 100`)],
);

export const studyLogs = sqliteTable("study_logs", {
  id: integer("id").primaryKey(),
  topicId: integer("topic_id").references(() => examTopics.id),
  subjectId: integer("subject_id").references(() => examSubjects.id),
  startedAt: integer("started_at").notNull(),
  durationMin: integer("duration_min").notNull(),
  notesEnc: blob("notes_enc"),
  notesNonce: blob("notes_nonce"),
  notesTag: blob("notes_tag"),
  createdAt: integer("created_at").notNull(),
});

export const goals = sqliteTable(
  "goals",
  {
    id: integer("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    targetDate: text("target_date"),
    progressPct: integer("progress_pct").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [check("goals_progress_chk", sql`progress_pct BETWEEN 0 AND 100`)],
);

export const goalMilestones = sqliteTable("goal_milestones", {
  id: integer("id").primaryKey(),
  goalId: integer("goal_id")
    .notNull()
    .references(() => goals.id),
  title: text("title").notNull(),
  dueDate: text("due_date"),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  startAt: integer("start_at").notNull(),
  endAt: integer("end_at"),
  allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
  color: text("color"),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const backups = sqliteTable(
  "backups",
  {
    id: integer("id").primaryKey(),
    kind: text("kind", { enum: ["auto", "manual", "export"] }).notNull(),
    path: text("path").notNull(),
    sizeBytes: integer("size_bytes"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [check("backups_kind_chk", sql`kind IN ('auto','manual','export')`)],
);

export const memories = sqliteTable("memories", {
  id: integer("id").primaryKey(),
  point: text("point").notNull(),
  category: text("category").default("fact"),
  sourceSessionId: text("source_session_id"),
  source: text("source").default("user"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    messageId: text("message_id"),
    title: text("title").notNull(),
    type: text("type").notNull(), // 'html' | 'physics' | 'react' | 'svg' | 'code'
    content: text("content").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_artifacts_session").on(t.sessionId),
    index("idx_artifacts_created").on(t.createdAt),
  ],
);

// FSRS Spaced Repetition Cards
export const fsrsCards = sqliteTable(
  "fsrs_cards",
  {
    id: integer("id").primaryKey(),
    subjectId: integer("subject_id")
      .notNull()
      .references(() => examSubjects.id),
    topicId: integer("topic_id").references(() => examTopics.id),
    due: integer("due").notNull(),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    scheduledDays: real("scheduled_days").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: integer("state").notNull().default(0), // 0=New, 1=Learning, 2=Review, 3=Relearning
    lastReview: integer("last_review"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_fsrs_cards_due").on(t.due),
    index("idx_fsrs_cards_subject").on(t.subjectId),
    index("idx_fsrs_cards_topic").on(t.topicId),
  ],
);

// Vector RAG: file_chunks table for encrypted semantic search
export const fileChunks = sqliteTable(
  "file_chunks",
  {
    id: integer("id").primaryKey(),
    filePath: text("file_path").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    // Encrypted with vault master key (envelope encryption)
    contentEnc: blob("content_enc").notNull(),
    contentNonce: blob("content_nonce").notNull(),
    contentTag: blob("content_tag").notNull(),
    // Raw f32[] embedding (768-dim nomic-embed-text, 1536-dim text-embedding-3-small)
    embedding: blob("embedding").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    tokenCount: integer("token_count").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_file_chunks_path").on(t.filePath),
    index("idx_file_chunks_model").on(t.embeddingModel),
  ],
);

// Sleep-Consolidation Memory Engine: two-tier STM → LTM
export const memoryConsolidation = sqliteTable(
  "memory_consolidation",
  {
    id: integer("id").primaryKey(),
    stmKey: text("stm_key").unique().notNull(),
    stmValue: text("stm_value").notNull(), // JSON: { fact, context, source, confidence }
    stmAccessCount: integer("stm_access_count").notNull().default(0),
    stmLastAccess: integer("stm_last_access").notNull(),
    ltmPromoted: integer("ltm_promoted", { mode: "boolean" }).notNull().default(false),
    ltmPoint: text("ltm_point"),
    ltmCategory: text("ltm_category"),
    decayScore: real("decay_score").notNull().default(1.0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_memory_stm_access").on(t.stmLastAccess),
    index("idx_memory_decay").on(t.decayScore),
  ],
);

// OpenDots — Always-On AI Coworkers schema
export const dots = sqliteTable("dots", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  character: text("character").notNull().default("blue"), // "blue" | "mint" | "orange" | "purple"
  role: text("role").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  model: text("model").default("auto"),
  tools: text("tools").notNull().default("[]"), // JSON string array of enabled tools
  status: text("status").notNull().default("idle"), // "idle" | "working" | "paused" | "complete" | "needs-input"
  workingDirectory: text("working_directory").default("/workspace"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const dotMessages = sqliteTable(
  "dot_messages",
  {
    id: text("id").primaryKey(),
    dotId: text("dot_id").notNull().references(() => dots.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // "user" | "assistant" | "system" | "tool"
    content: text("content").notNull(),
    toolCalls: text("tool_calls"), // JSON array of ToolCallPart for canonical assistant tool turns
    toolCallId: text("tool_call_id"), // Matching call ID for tool result turns
    toolName: text("tool_name"),
    toolArgs: text("tool_args"),
    toolResult: text("tool_result"),
    status: text("status").default("done"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_dot_messages_dot").on(t.dotId), index("idx_dot_messages_created").on(t.createdAt)],
);

export const dotSpaces = sqliteTable(
  "dot_spaces",
  {
    id: text("id").primaryKey(),
    dotId: text("dot_id").notNull().references(() => dots.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("idx_dot_spaces_dot").on(t.dotId)],
);

export const dotTasks = sqliteTable(
  "dot_tasks",
  {
    id: text("id").primaryKey(),
    dotId: text("dot_id").notNull().references(() => dots.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    status: text("status").notNull().default("queued"), // "queued" | "running" | "completed" | "failed" | "paused"
    intervalSeconds: integer("interval_seconds"), // null = one-off, or repeat interval in seconds
    nextRunAt: integer("next_run_at"),
    lastRunAt: integer("last_run_at"),
    lastResult: text("last_result"),
    error: text("error"),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_dot_tasks_dot").on(t.dotId),
    index("idx_dot_tasks_status").on(t.status),
    index("idx_dot_tasks_next_run").on(t.nextRunAt),
  ],
);

