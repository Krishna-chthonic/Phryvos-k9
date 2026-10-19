/**
 * Exam subjects, topics, and study session management for phryvos-k9 agent tools.
 *
 * Importers/callers: lib/agent/tools.ts, tests/file-plugins.test.ts
 * Affected API: Agent tool execution (list_exam_topics, log_study_session)
 * Data schemas if any: exam_subjects, exam_topics, study_logs tables in SQLite
 * User instruction verbatim: "ek last problem hai ki ai zip , pdf , etc ko read nhi kar sakta aur uske paas jyada skills and plugins nhi hai"
 */
import type { VaultCtx } from "../vault-service";
import { encryptBlob } from "../crypto/envelope";

export interface ExamSubjectSummary {
  id: number;
  name: string;
  targetDate: string | null;
  color: string | null;
  topics: Array<{
    id: number;
    name: string;
    progressPct: number;
    dueDate: string | null;
  }>;
}

/**
 * List all exam preparation subjects and their detailed topic progress.
 */
export function listExamSubjectsWithTopics(ctx: VaultCtx): string {
  const subjects = ctx.db
    .prepare("SELECT * FROM exam_subjects ORDER BY name ASC")
    .all() as Array<{
    id: number;
    name: string;
    target_date: string | null;
    color: string | null;
  }>;

  if (subjects.length === 0) {
    return "(No exam subjects configured yet. Create one via exam prep or ask to add subjects.)";
  }

  const lines: string[] = [];
  for (const s of subjects) {
    const topics = ctx.db
      .prepare("SELECT * FROM exam_topics WHERE subject_id = ? ORDER BY name ASC")
      .all(s.id) as Array<{
      id: number;
      name: string;
      progress_pct: number;
      due_date: string | null;
    }>;

    const avgProgress =
      topics.length > 0
        ? Math.round(topics.reduce((acc, t) => acc + t.progress_pct, 0) / topics.length)
        : 0;

    lines.push(
      `📚 Subject #${s.id}: **${s.name}** (${avgProgress}% average progress)${s.target_date ? ` · Exam Date: ${s.target_date}` : ""}`,
    );

    if (topics.length === 0) {
      lines.push("   (no topics registered for this subject)");
    } else {
      for (const t of topics) {
        const bar = "▓".repeat(Math.floor(t.progress_pct / 10)) + "░".repeat(10 - Math.floor(t.progress_pct / 10));
        lines.push(
          `   - [${bar}] ${t.progress_pct}% — **${t.name}**${t.due_date ? ` (due ${t.due_date})` : ""}`,
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Log a study session into study_logs table.
 */
export function logExamStudySession(
  ctx: VaultCtx,
  input: {
    topicName?: string;
    subjectName?: string;
    durationMin: number;
    notes?: string;
  },
): string {
  if (input.durationMin <= 0) {
    return "Study duration must be greater than 0 minutes.";
  }

  let matchedTopicId: number | null = null;
  let matchedSubjectId: number | null = null;
  let matchedTopicName = "";
  let matchedSubjectName = "";

  if (input.topicName) {
    const t = ctx.db
      .prepare(
        `SELECT t.id, t.name, t.subject_id, s.name as subject_name
         FROM exam_topics t JOIN exam_subjects s ON s.id = t.subject_id
         WHERE LOWER(t.name) LIKE LOWER(?) LIMIT 1`,
      )
      .get(`%${input.topicName.trim()}%`) as
      | { id: number; name: string; subject_id: number; subject_name: string }
      | undefined;

    if (t) {
      matchedTopicId = t.id;
      matchedTopicName = t.name;
      matchedSubjectId = t.subject_id;
      matchedSubjectName = t.subject_name;
    }
  }

  if (!matchedSubjectId && input.subjectName) {
    const s = ctx.db
      .prepare("SELECT id, name FROM exam_subjects WHERE LOWER(name) LIKE LOWER(?) LIMIT 1")
      .get(`%${input.subjectName.trim()}%`) as { id: number; name: string } | undefined;

    if (s) {
      matchedSubjectId = s.id;
      matchedSubjectName = s.name;
    }
  }

  const now = Date.now();
  let encBlob = null;
  if (input.notes && input.notes.trim()) {
    encBlob = encryptBlob(ctx.key, input.notes.trim());
  }

  const r = ctx.db
    .prepare(
      `INSERT INTO study_logs (topic_id, subject_id, started_at, duration_min, notes_enc, notes_nonce, notes_tag, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      matchedTopicId,
      matchedSubjectId,
      now - input.durationMin * 60_000,
      input.durationMin,
      encBlob?.enc ?? null,
      encBlob?.nonce ?? null,
      encBlob?.tag ?? null,
      now,
    );

  const targetStr = matchedTopicName
    ? `on **${matchedSubjectName} / ${matchedTopicName}**`
    : matchedSubjectName
    ? `on subject **${matchedSubjectName}**`
    : `(general study session)`;

  return `Logged study session #${Number(r.lastInsertRowid)}: ${input.durationMin} minutes ${targetStr}${input.notes ? ` with notes.` : "."}`;
}
