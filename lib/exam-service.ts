/**
 * P6: server-side CRUD for the exam preparation domain.
 *
 * Importers/callers:
 *   - app/api/exam-subjects/route.ts (GET/POST)
 *   - app/api/exam-subjects/[id]/route.ts (GET/PATCH/DELETE)
 *   - app/api/exam-topics/route.ts (GET per subject, POST)
 *   - app/api/exam-topics/[id]/route.ts (GET/PATCH/DELETE)
 *   - app/api/study-logs/route.ts (GET/POST)
 *   - app/api/study-logs/[id]/route.ts (DELETE)
 *   - Agent tools in lib/agent/tools/goals-events.ts (exam_progress_update)
 *   - components/exams/ExamsApp.tsx (client-side API calls)
 *   - FSRS integration for spaced repetition review scheduling
 *
 * Data schemas: exam_subjects, exam_topics, study_logs, fsrs_cards (from lib/db/schema.ts)
 */

import type Database from "better-sqlite3";
import { gcmDecrypt, gcmEncrypt } from "./crypto/envelope";
import {
  FSRSCard,
  FSRSParameters,
  DEFAULT_FSRS_PARAMETERS,
  ReviewResult,
  Rating,
  scheduleCard,
  createFSRSCard,
  getDueCards,
  getUpcomingCards,
} from "./fsrs";

export interface ExamCtx {
  db: Database.Database;
  key: Buffer;
}

export class ExamError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "invalid"
      | "subject_required"
      | "topic_required",
    message: string,
  ) {
    super(message);
    this.name = "ExamError";
  }
}

// ------------------------------------------------------------ row shapes

export interface SubjectRow {
  id: number;
  name: string;
  targetDate: string | null;
  color: string | null;
  createdAt: number;
  topicCount: number;
  avgProgress: number; // 0-100 rounded
}

export interface TopicRow {
  id: number;
  subjectId: number;
  name: string;
  progressPct: number;
  dueDate: string | null;
  createdAt: number;
  updatedAt: number;
  logCount: number;
}

export interface StudyLogRow {
  id: number;
  topicId: number | null;
  subjectId: number | null;
  startedAt: number;
  durationMin: number;
  note: string | null; // decrypted
  createdAt: number;
}

// ------------------------------------------------------------ subjects

export function listSubjects(ctx: ExamCtx): SubjectRow[] {
  const rows = ctx.db.prepare(`
    SELECT
      s.id, s.name, s.target_date AS targetDate, s.color, s.created_at AS createdAt,
      COUNT(t.id) AS topicCount,
      COALESCE(ROUND(AVG(t.progress_pct)), 0) AS avgProgress
    FROM exam_subjects s
    LEFT JOIN exam_topics t ON t.subject_id = s.id
    GROUP BY s.id
    ORDER BY s.target_date ASC NULLS LAST, s.name ASC
  `).all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    targetDate: r.target_date as string | null,
    color: r.color as string | null,
    createdAt: r.created_at as number,
    topicCount: r.topicCount as number,
    avgProgress: Math.round(r.avgProgress as number),
  }));
}

export function getSubject(ctx: ExamCtx, id: number): SubjectRow | null {
  const r = ctx.db.prepare(`
    SELECT
      s.id, s.name, s.target_date AS targetDate, s.color, s.created_at AS createdAt,
      COUNT(t.id) AS topicCount,
      COALESCE(ROUND(AVG(t.progress_pct)), 0) AS avgProgress
    FROM exam_subjects s
    LEFT JOIN exam_topics t ON t.subject_id = s.id
    WHERE s.id = ?
    GROUP BY s.id
  `).get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: r.id as number,
    name: r.name as string,
    targetDate: r.target_date as string | null,
    color: r.color as string | null,
    createdAt: r.created_at as number,
    topicCount: r.topicCount as number,
    avgProgress: Math.round(r.avgProgress as number),
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CreateSubjectInput {
  name: string;
  targetDate?: string | null;
  color?: string | null;
}

export function createSubject(ctx: ExamCtx, input: CreateSubjectInput): SubjectRow {
  if (!input.name.trim())
    throw new ExamError("invalid", "Subject name is required");
  if (input.targetDate && !DATE_RE.test(input.targetDate))
    throw new ExamError("invalid", "targetDate must be YYYY-MM-DD");

  const now = Date.now();
  const result = ctx.db.prepare(`
    INSERT INTO exam_subjects (name, target_date, color, created_at)
    VALUES (?, ?, ?, ?)
  `).run(input.name.trim(), input.targetDate ?? null, input.color ?? null, now);

  const id = Number(result.lastInsertRowid);
  const row = getSubject(ctx, id);
  if (!row) throw new ExamError("invalid", "Failed to read created subject");
  return row;
}

export function deleteSubject(ctx: ExamCtx, id: number): void {
  const existing = getSubject(ctx, id);
  if (!existing)
    throw new ExamError("not_found", `Subject ${id} not found`);
  const tx = ctx.db.transaction(() => {
    ctx.db.prepare("DELETE FROM study_logs WHERE subject_id = ?").run(id);
    ctx.db.prepare("DELETE FROM exam_topics WHERE subject_id = ?").run(id);
    ctx.db.prepare("DELETE FROM exam_subjects WHERE id = ?").run(id);
  });
  tx();
}

// ------------------------------------------------------------ topics

export function listTopics(ctx: ExamCtx, subjectId: number): TopicRow[] {
  const rows = ctx.db.prepare(`
    SELECT
      t.id, t.subject_id AS subjectId, t.name, t.progress_pct AS progressPct,
      t.due_date AS dueDate, t.created_at AS createdAt, t.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM study_logs sl WHERE sl.topic_id = t.id) AS logCount
    FROM exam_topics t
    WHERE t.subject_id = ?
    ORDER BY t.progress_pct ASC, t.name ASC
  `).all(subjectId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as number,
    subjectId: r.subject_id as number,
    name: r.name as string,
    progressPct: r.progress_pct as number,
    dueDate: r.due_date as string | null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    logCount: r.logCount as number,
  }));
}

export function getTopic(ctx: ExamCtx, subjectId: number, topicId: number): TopicRow | null {
  const r = ctx.db.prepare(`
    SELECT t.id, t.subject_id AS subjectId, t.name, t.progress_pct AS progressPct,
           t.due_date AS dueDate, t.created_at AS createdAt, t.updated_at AS updatedAt,
           (SELECT COUNT(*) FROM study_logs sl WHERE sl.topic_id = t.id) AS logCount
    FROM exam_topics t
    WHERE t.id = ? AND t.subject_id = ?
  `).get(topicId, subjectId) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: r.id as number,
    subjectId: r.subject_id as number,
    name: r.name as string,
    progressPct: r.progress_pct as number,
    dueDate: r.due_date as string | null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    logCount: r.logCount as number,
  };
}

export interface CreateTopicInput {
  subjectId: number;
  name: string;
  dueDate?: string | null;
}

export function createTopic(ctx: ExamCtx, input: CreateTopicInput): TopicRow {
  if (!input.name.trim())
    throw new ExamError("invalid", "Topic name is required");
  const subject = getSubject(ctx, input.subjectId);
  if (!subject)
    throw new ExamError("not_found", `Subject ${input.subjectId} not found`);
  if (input.dueDate && !DATE_RE.test(input.dueDate))
    throw new ExamError("invalid", "dueDate must be YYYY-MM-DD");

  const now = Date.now();
  const result = ctx.db.prepare(`
    INSERT INTO exam_topics (subject_id, name, progress_pct, due_date, created_at, updated_at)
    VALUES (?, ?, 0, ?, ?, ?)
  `).run(input.subjectId, input.name.trim(), input.dueDate ?? null, now, now);

  const topicId = Number(result.lastInsertRowid);
  return getTopic(ctx, input.subjectId, topicId)!;
}

export interface UpdateTopicInput {
  name?: string;
  progressPct?: number;
  dueDate?: string | null;
}

export function updateTopic(
  ctx: ExamCtx,
  subjectId: number,
  topicId: number,
  input: UpdateTopicInput,
): TopicRow {
  const existing = getTopic(ctx, subjectId, topicId);
  if (!existing)
    throw new ExamError("not_found", `Topic ${topicId} not found in subject ${subjectId}`);

  const name = input.name?.trim() ?? existing.name;
  const progressPct = input.progressPct ?? existing.progressPct;
  const dueDate = input.dueDate ?? existing.dueDate;

  if (input.progressPct !== undefined && (progressPct < 0 || progressPct > 100))
    throw new ExamError("invalid", "progressPct must be 0-100");

  ctx.db.prepare(`
    UPDATE exam_topics
    SET name = ?, progress_pct = ?, due_date = ?, updated_at = ?
    WHERE id = ? AND subject_id = ?
  `).run(name, progressPct, dueDate, Date.now(), topicId, subjectId);

  return getTopic(ctx, subjectId, topicId)!;
}

export function deleteTopic(ctx: ExamCtx, subjectId: number, topicId: number): void {
  const existing = getTopic(ctx, subjectId, topicId);
  if (!existing)
    throw new ExamError("not_found", `Topic ${topicId} not found in subject ${subjectId}`);
  const tx = ctx.db.transaction(() => {
    ctx.db.prepare("DELETE FROM study_logs WHERE topic_id = ?").run(topicId);
    ctx.db.prepare("DELETE FROM exam_topics WHERE id = ? AND subject_id = ?").run(topicId, subjectId);
  });
  tx();
}

// ------------------------------------------------------------ study logs

export function listStudyLogs(
  ctx: ExamCtx,
  opts: { topicId?: number; subjectId?: number; limit?: number },
): StudyLogRow[] {
  const wh: string[] = [];
  const params: unknown[] = [];
  if (opts.topicId) {
    wh.push("topic_id = ?");
    params.push(opts.topicId);
  }
  if (opts.subjectId) {
    wh.push("subject_id = ?");
    params.push(opts.subjectId);
  }
  const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
  const limit = opts.limit ?? 200;

  const rows = ctx.db.prepare(`
    SELECT id, topic_id AS topicId, subject_id AS subjectId,
           started_at AS startedAt, duration_min AS durationMin,
           notes_enc AS notesEnc, notes_nonce AS notesNonce, notes_tag AS notesTag,
           created_at AS createdAt
    FROM study_logs ${where}
    ORDER BY started_at DESC
    LIMIT ${limit}
  `).all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as number,
    topicId: r.topic_id as number | null,
    subjectId: r.subject_id as number | null,
    startedAt: r.started_at as number,
    durationMin: r.duration_min as number,
    note: decryptStudyNotes(
      r.notes_enc as Buffer | undefined,
      r.notes_nonce as Buffer | undefined,
      r.notes_tag as Buffer | undefined,
      ctx.key,
    ),
    createdAt: r.created_at as number,
  }));
}

export interface CreateStudyLogInput {
  topicId?: number | null;
  subjectId?: number | null;
  startedAt: number;
  durationMin: number;
  note?: string | null;
}

export function createStudyLog(ctx: ExamCtx, input: CreateStudyLogInput): StudyLogRow {
  if (input.topicId == null && input.subjectId == null)
    throw new ExamError("invalid", "Must provide topicId or subjectId");

  const now = Date.now();
  const { notesEnc, notesNonce, notesTag } = encryptStudyNote(input.note ?? null, ctx.key);

  ctx.db.prepare(`
    INSERT INTO study_logs
      (topic_id, subject_id, started_at, duration_min,
       notes_enc, notes_nonce, notes_tag, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.topicId ?? null,
    input.subjectId ?? null,
    input.startedAt,
    input.durationMin,
    notesEnc,
    notesNonce,
    notesTag,
    now,
  );

  const id = Number(ctx.db.prepare("SELECT last_insert_rowid()").get() as Record<string, unknown>);
  return getStudyLog(ctx, id)!;
}

export function deleteStudyLog(ctx: ExamCtx, id: number): void {
  ctx.db.prepare("DELETE FROM study_logs WHERE id = ?").run(id);
}

function getStudyLog(ctx: ExamCtx, id: number): StudyLogRow | null {
  const r = ctx.db.prepare(`
    SELECT id, topic_id AS topicId, subject_id AS subjectId,
           started_at AS startedAt, duration_min AS durationMin,
           notes_enc AS notesEnc, notes_nonce AS notesNonce, notes_tag AS notesTag,
           created_at AS createdAt
    FROM study_logs WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: r.id as number,
    topicId: r.topic_id as number | null,
    subjectId: r.subject_id as number | null,
    startedAt: r.started_at as number,
    durationMin: r.duration_min as number,
    note: decryptStudyNotes(
      r.notes_enc as Buffer | undefined,
      r.notes_nonce as Buffer | undefined,
      r.notes_tag as Buffer | undefined,
      ctx.key,
    ),
    createdAt: r.created_at as number,
  };
}

// ------------------------------------------------------------ crypto helpers

function encryptStudyNote(
  text: string | null,
  key: Buffer,
): { notesEnc: Buffer | null; notesNonce: Buffer | null; notesTag: Buffer | null } {
  if (!text) return { notesEnc: null, notesNonce: null, notesTag: null };
  const blob = gcmEncrypt(key, Buffer.from(text, "utf8"));
  return { notesEnc: blob.enc, notesNonce: blob.nonce, notesTag: blob.tag };
}

function decryptStudyNotes(
  enc: Buffer | undefined,
  nonce: Buffer | undefined,
  tag: Buffer | undefined,
  key: Buffer,
): string | null {
  if (!enc || !nonce || !tag) return null;
  try {
    return gcmDecrypt(key, { enc, nonce, tag }).toString("utf8");
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ FSRS Spaced Repetition

export interface FSRSRow {
  id: number;
  subjectId: number;
  topicId: number | null;
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: number | null;
  createdAt: number;
  updatedAt: number;
}

export function listFSRSCards(ctx: ExamCtx, subjectId?: number): FSRSCard[] {
  const where = subjectId ? "WHERE subject_id = ?" : "";
  const params = subjectId ? [subjectId] : [];

  const rows = ctx.db.prepare(`
    SELECT id, subject_id AS subjectId, topic_id AS topicId, due, stability, difficulty,
           elapsed_days AS elapsedDays, scheduled_days AS scheduledDays, reps, lapses,
           state, last_review AS lastReview, created_at AS createdAt, updated_at AS updatedAt
    FROM fsrs_cards ${where}
    ORDER BY due ASC
  `).all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as number,
    subjectId: r.subjectId as number,
    topicId: r.topicId as number | null,
    due: r.due as number,
    stability: r.stability as number,
    difficulty: r.difficulty as number,
    elapsedDays: r.elapsedDays as number,
    scheduledDays: r.scheduledDays as number,
    reps: r.reps as number,
    lapses: r.lapses as number,
    state: r.state as number,
    lastReview: r.lastReview as number | null,
    createdAt: r.createdAt as number,
    updatedAt: r.updatedAt as number,
  }));
}

export function getFSRSCard(ctx: ExamCtx, id: number): FSRSCard | null {
  const r = ctx.db.prepare(`
    SELECT id, subject_id AS subjectId, topic_id AS topicId, due, stability, difficulty,
           elapsed_days AS elapsedDays, scheduled_days AS scheduledDays, reps, lapses,
           state, last_review AS lastReview, created_at AS createdAt, updated_at AS updatedAt
    FROM fsrs_cards WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined;

  if (!r) return null;
  return {
    id: r.id as number,
    subjectId: r.subjectId as number,
    topicId: r.topicId as number | null,
    due: r.due as number,
    stability: r.stability as number,
    difficulty: r.difficulty as number,
    elapsedDays: r.elapsedDays as number,
    scheduledDays: r.scheduledDays as number,
    reps: r.reps as number,
    lapses: r.lapses as number,
    state: r.state as number,
    lastReview: r.lastReview as number | null,
    createdAt: r.createdAt as number,
    updatedAt: r.updatedAt as number,
  };
}

export function getDueFSRSCards(ctx: ExamCtx, subjectId?: number, now: number = Date.now()): FSRSCard[] {
  const where = subjectId ? "WHERE subject_id = ? AND due <= ?" : "WHERE due <= ?";
  const params = subjectId ? [subjectId, now] : [now];

  const rows = ctx.db.prepare(`
    SELECT id, subject_id AS subjectId, topic_id AS topicId, due, stability, difficulty,
           elapsed_days AS elapsedDays, scheduled_days AS scheduledDays, reps, lapses,
           state, last_review AS lastReview, created_at AS createdAt, updated_at AS updatedAt
    FROM fsrs_cards ${where}
    ORDER BY due ASC
  `).all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as number,
    subjectId: r.subjectId as number,
    topicId: r.topicId as number | null,
    due: r.due as number,
    stability: r.stability as number,
    difficulty: r.difficulty as number,
    elapsedDays: r.elapsedDays as number,
    scheduledDays: r.scheduledDays as number,
    reps: r.reps as number,
    lapses: r.lapses as number,
    state: r.state as number,
    lastReview: r.lastReview as number | null,
    createdAt: r.createdAt as number,
    updatedAt: r.updatedAt as number,
  }));
}

export function createFSRSCardForSubject(
  ctx: ExamCtx,
  subjectId: number,
  topicId: number | null,
  params: FSRSParameters = DEFAULT_FSRS_PARAMETERS,
  now: number = Date.now()
): FSRSCard {
  const subject = getSubject(ctx, subjectId);
  if (!subject) throw new ExamError("not_found", `Subject ${subjectId} not found`);

  const card = createFSRSCard(subjectId, topicId, params, now);

  const result = ctx.db.prepare(`
    INSERT INTO fsrs_cards
      (subject_id, topic_id, due, stability, difficulty, elapsed_days, scheduled_days,
       reps, lapses, state, last_review, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    card.subjectId,
    card.topicId,
    card.due,
    card.stability,
    card.difficulty,
    card.elapsedDays,
    card.scheduledDays,
    card.reps,
    card.lapses,
    card.state,
    card.lastReview,
    card.createdAt,
    card.updatedAt,
  );

  const id = Number(result.lastInsertRowid);
  return getFSRSCard(ctx, id)!;
}

export function reviewFSRSCard(
  ctx: ExamCtx,
  cardId: number,
  rating: Rating,
  params: FSRSParameters = DEFAULT_FSRS_PARAMETERS,
  now: number = Date.now()
): ReviewResult | null {
  const card = getFSRSCard(ctx, cardId);
  if (!card) return null;

  const result = scheduleCard(card, rating, params, now);

  ctx.db.prepare(`
    UPDATE fsrs_cards
    SET due = ?, stability = ?, difficulty = ?, elapsed_days = ?, scheduled_days = ?,
        reps = ?, lapses = ?, state = ?, last_review = ?, updated_at = ?
    WHERE id = ?
  `).run(
    result.card.due,
    result.card.stability,
    result.card.difficulty,
    result.card.elapsedDays,
    result.card.scheduledDays,
    result.card.reps,
    result.card.lapses,
    result.card.state,
    result.card.lastReview,
    result.card.updatedAt,
    cardId,
  );

  return result;
}

export function getUpcomingFSRSReviews(
  ctx: ExamCtx,
  subjectId: number | undefined,
  windowMs: number,
  now: number = Date.now()
): FSRSCard[] {
  const limit = now + windowMs;
  const where = subjectId
    ? "WHERE subject_id = ? AND due > ? AND due <= ?"
    : "WHERE due > ? AND due <= ?";
  const params = subjectId ? [subjectId, now, limit] : [now, limit];

  const rows = ctx.db.prepare(`
    SELECT id, subject_id AS subjectId, topic_id AS topicId, due, stability, difficulty,
           elapsed_days AS elapsedDays, scheduled_days AS scheduledDays, reps, lapses,
           state, last_review AS lastReview, created_at AS createdAt, updated_at AS updatedAt
    FROM fsrs_cards ${where}
    ORDER BY due ASC
  `).all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as number,
    subjectId: r.subjectId as number,
    topicId: r.topicId as number | null,
    due: r.due as number,
    stability: r.stability as number,
    difficulty: r.difficulty as number,
    elapsedDays: r.elapsedDays as number,
    scheduledDays: r.scheduledDays as number,
    reps: r.reps as number,
    lapses: r.lapses as number,
    state: r.state as number,
    lastReview: r.lastReview as number | null,
    createdAt: r.createdAt as number,
    updatedAt: r.updatedAt as number,
  }));
}
