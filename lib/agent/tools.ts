/**
 * Agent tools for phryvos-k9.
 *
 * Importers/callers: lib/agent/loop.ts
 * Affected API: Agent SSE tool execution
 * Data schemas if any: All vault tables + memories table
 * User instruction verbatim: "3. ek memmory system bhi hona chahiye ai ke liye jisme vo points bana ke chijo ko permanentlt yaad rakhe jinko users khud se kahe ki ye chij yaad rakhna ya permanently save kar lo"
 */
import { z } from "zod";
import {
  createDir,
  createFile,
  deleteFile,
  getMeta,
  listDir,
  moveFile,
  readFile,
  search,
  VaultError,
  writeFile,
  type FileMeta,
  type VaultCtx,
} from "../vault-service";
import { registerTool } from "./registry";
import { runDataQuery, formatRows, DataQueryError } from "./data-query";
import { addMemory, listMemories, deleteMemory } from "../memory-service";
import { performWebSearch } from "./web-search";
import { performWebFetch } from "./web-fetch";

/**
 * All P4 agent tools, defined once. Registration is idempotent; the loop
 * (and tests) call ensureAgentTools() before touching the registry.
 *
 * Every tool returns a short, model-friendly string. File tools go through
 * vault-service (same code the P2 API routes use); tracking tools use
 * direct SQL on the plaintext metadata tables; data_query is the sandboxed
 * read-only SQL escape hatch.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function toMs(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && DAY.test(v)) {
    return new Date(`${v}T00:00:00Z`).getTime();
  }
  const t = Date.parse(String(v));
  if (Number.isNaN(t)) throw new Error(`unparseable date: ${String(v)}`);
  return t;
}

function fmtWhen(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16);
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(1)} MiB`;
}

function metaLine(m: FileMeta): string {
  if (m.isDir) return `dir  ${m.path}`;
  return `file ${m.path} — ${fmtSize(m.sizeBytes ?? 0)}${m.version > 1 ? `, v${m.version}` : ""}`;
}

const isTextMime = (mime: string | null) =>
  !!mime &&
  (mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/typescript" ||
    mime === "application/csv" ||
    mime === "application/sql" ||
    mime === "application/yaml" ||
    mime === "application/x-yaml" ||
    mime === "image/svg+xml");

function nowMs(): number {
  return Date.now();
}

// ------------------------------------------------------------------ files

function toolListFiles(ctx: VaultCtx, a: { path?: string }) {
  const parent = a.path?.trim() || "/";
  const rows = listDir(ctx, parent);
  if (rows.length === 0) return `(empty: ${parent})`;
  return rows.map(metaLine).join("\n");
}

function toolReadFile(ctx: VaultCtx, a: { path: string }) {
  const { bytes, mime } = readFile(ctx, a.path);
  if (bytes.length === 0) return "(empty file)";
  if (!isTextMime(mime)) {
    return `Binary file (${mime ?? "unknown type"}, ${fmtSize(bytes.length)}) — content not displayed.`;
  }
  const text = bytes.toString("utf8");
  const cap = 100_000;
  return text.length > cap
    ? `${text.slice(0, cap)}\n… [${text.length - cap} more chars, read in a narrower range or search instead]`
    : text;
}

function toolWriteFile(ctx: VaultCtx, a: { path: string; content: string }) {
  try {
    getMeta(ctx, a.path);
  } catch (e) {
    if (e instanceof VaultError && e.code === "not_found") {
      createFile(ctx, a.path);
    } else if (e instanceof VaultError && e.code === "not_a_file") {
      throw e; // a directory — let it surface
    } else {
      throw e;
    }
  }
  const m = writeFile(ctx, a.path, a.content, "AI agent");
  return `Wrote ${a.path} (${fmtSize(m.sizeBytes ?? a.content.length)}, v${m.version}).`;
}

function toolCreateDir(ctx: VaultCtx, a: { path: string }) {
  const m = createDir(ctx, a.path);
  return `Directory ready: ${m.path}`;
}

function toolMoveFile(ctx: VaultCtx, a: { from: string; to: string }) {
  const m = moveFile(ctx, a.from, a.to);
  return `Moved ${a.from} → ${m.path}`;
}

function toolDeleteFile(ctx: VaultCtx, a: { path: string }) {
  deleteFile(ctx, a.path);
  return `Moved ${a.path} to the trash. It can be restored from /trash.`;
}

function toolSearchFiles(ctx: VaultCtx, a: { query: string; limit?: number }) {
  const hits = search(ctx, a.query).slice(0, Math.min(a.limit ?? 25, 50));
  if (hits.length === 0) return `No files or content match "${a.query}".`;
  return hits
    .map((h) =>
      h.snippet ? `${h.path} (in content: ⏴${h.snippet}⏵)` : h.isDir ? `dir ${h.path}` : `file ${h.path}`,
    )
    .join("\n");
}

// ---------------------------------------------------------------- projects

function toolCreateProject(
  ctx: VaultCtx,
  a: {
    title: string;
    description?: string;
    color?: string;
    startDate?: string | null;
    endDate?: string | null;
  },
) {
  const now = nowMs();
  const r = ctx.db
    .prepare(
      `INSERT INTO projects (title, description, color, status, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
    )
    .run(
      a.title,
      a.description ?? null,
      a.color ?? null,
      a.startDate ?? null,
      a.endDate ?? null,
      now,
      now,
    );
  return `Created project #${Number(r.lastInsertRowid)} "${a.title}".`;
}

function toolListProjects(ctx: VaultCtx, a: { status?: string; includeArchived?: boolean }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (a.status) {
    where.push("p.status = ?");
    params.push(a.status);
  } else if (!a.includeArchived) {
    where.push("p.status = 'active'");
  }
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const rows = ctx.db
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count
       FROM projects p${sql} ORDER BY p.updated_at DESC LIMIT 50`,
    )
    .all(...params) as Array<Record<string, unknown> & { id: number; title: string; status: string }>;
  if (rows.length === 0) return "(no projects)";
  return rows
    .map(
      (r) =>
        `#${r.id} "${r.title}" [${r.status}] ${r.task_count} tasks (${r.done_count} done)` +
        (typeof r.start_date === "string" ? ` · start ${r.start_date}` : "") +
        (typeof r.end_date === "string" ? ` · due ${r.end_date}` : ""),
    )
    .join("\n");
}

function toolUpdateProject(
  ctx: VaultCtx,
  a: {
    id: number;
    title?: string;
    description?: string | null;
    color?: string | null;
    status?: string;
    startDate?: string | null;
    endDate?: string | null;
  },
) {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    params.push(v ?? null);
  };
  if (a.title !== undefined) push("title", a.title);
  if (a.description !== undefined) push("description", a.description);
  if (a.color !== undefined) push("color", a.color);
  if (a.status !== undefined) push("status", a.status);
  if (a.startDate !== undefined) push("start_date", a.startDate);
  if (a.endDate !== undefined) push("end_date", a.endDate);
  if (sets.length === 0) return "Nothing to update — provide at least one field.";
  sets.push("updated_at = ?");
  params.push(nowMs(), a.id);
  const r = ctx.db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  if (r.changes === 0) return `Project #${a.id} does not exist.`;
  return `Updated project #${a.id}.`;
}

function toolDeleteProject(ctx: VaultCtx, a: { id: number }) {
  const p = ctx.db.prepare("SELECT id, title FROM projects WHERE id = ?").get(a.id) as
    | { id: number; title: string }
    | undefined;
  if (!p) return `Project #${a.id} does not exist.`;
  const taskIds = ctx.db
    .prepare("SELECT id FROM tasks WHERE project_id = ?")
    .all(a.id) as Array<{ id: number }>;
  const tx = ctx.db.transaction(() => {
    if (taskIds.length > 0) {
      const ids = taskIds.map((t) => t.id);
      const ph = ids.map(() => "?").join(",");
      ctx.db
        .prepare(`DELETE FROM task_deps WHERE task_id IN (${ph}) OR blocks_task_id IN (${ph})`)
        .run(...ids, ...ids);
      ctx.db.prepare(`DELETE FROM time_entries WHERE task_id IN (${ph})`).run(...ids);
      ctx.db.prepare(`DELETE FROM tasks WHERE id IN (${ph})`).run(...ids);
    }
    ctx.db.prepare("DELETE FROM projects WHERE id = ?").run(a.id);
  });
  tx();
  return `Deleted project #${a.id} "${p.title}" (${taskIds.length} tasks and their entries removed).`;
}

// ------------------------------------------------------------------- tasks

function toolCreateTask(
  ctx: VaultCtx,
  a: {
    title: string;
    projectId?: number | null;
    description?: string;
    priority?: number;
    status?: "todo" | "doing" | "done";
    dueDate?: string | null;
    tags?: string[];
  },
) {
  const now = nowMs();
  const status = a.status ?? "todo";
  const r = ctx.db
    .prepare(
      `INSERT INTO tasks (project_id, title, description, status, priority, due_date, start_date, tags, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    )
    .run(
      a.projectId ?? null,
      a.title,
      a.description ?? null,
      status,
      a.priority ?? 1,
      a.dueDate ?? null,
      JSON.stringify(a.tags ?? []),
      status === "done" ? now : null,
      now,
      now,
    );
  const proj = a.projectId
    ? ((ctx.db
        .prepare("SELECT title FROM projects WHERE id = ?")
        .get(a.projectId) as { title: string } | undefined)?.title ?? `#${a.projectId}`)
    : "no project";
  return `Created task #${Number(r.lastInsertRowid)} "${a.title}" (project ${proj}, priority ${a.priority ?? 1}, status ${status}${a.dueDate ? `, due ${a.dueDate}` : ""}).`;
}

function toolListTasks(
  ctx: VaultCtx,
  a: { projectId?: number; status?: string; limit?: number },
) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (a.projectId !== undefined) {
    where.push("t.project_id = ?");
    params.push(a.projectId);
  }
  if (a.status) {
    where.push("t.status = ?");
    params.push(a.status);
  }
  const sql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const rows = ctx.db
    .prepare(
      `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.completed_at, p.title AS project
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       ${sql} ORDER BY t.priority DESC, t.due_date IS NULL, t.due_date, t.id
       LIMIT ?`,
    )
    .all(...params, Math.min(a.limit ?? 50, 100)) as Array<Record<string, unknown> & {
      id: number;
      title: string;
      status: string;
    }>;
  if (rows.length === 0) return `(no tasks${a.status ? ` with status ${a.status}` : ""})`;
  return rows
    .map(
      (r) =>
        `#${r.id} ${r.status === "done" ? "✓" : "○"} ${r.title} [${r.status}, p${r.priority}]` +
        (r.project ? ` · ${r.project}` : "") +
        (typeof r.due_date === "string" ? ` · due ${r.due_date}` : ""),
    )
    .join("\n");
}

function toolUpdateTask(
  ctx: VaultCtx,
  a: {
    id: number;
    title?: string;
    description?: string | null;
    status?: "todo" | "doing" | "done";
    priority?: number;
    dueDate?: string | null;
    tags?: string[];
  },
) {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    params.push(v);
  };
  if (a.title !== undefined) push("title", a.title);
  if (a.description !== undefined) push("description", a.description);
  if (a.status !== undefined) {
    push("status", a.status);
    push("completed_at", a.status === "done" ? nowMs() : null);
  }
  if (a.priority !== undefined) push("priority", a.priority);
  if (a.dueDate !== undefined) push("due_date", a.dueDate);
  if (a.tags !== undefined) push("tags", JSON.stringify(a.tags));
  if (sets.length === 0) return "Nothing to update — provide at least one field.";
  sets.push("updated_at = ?");
  params.push(nowMs(), a.id);
  const r = ctx.db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  if (r.changes === 0) return `Task #${a.id} does not exist.`;
  const t = ctx.db
    .prepare("SELECT status, due_date FROM tasks WHERE id = ?")
    .get(a.id) as { status: string; due_date: string | null };
  return `Updated task #${a.id} (now ${t.status}${t.due_date ? `, due ${t.due_date}` : ""}).`;
}

// ------------------------------------------------------------------ events

function toolCreateEvent(
  ctx: VaultCtx,
  a: {
    title: string;
    startAt: string | number;
    endAt?: string | number;
    allDay?: boolean;
    color?: string;
    notes?: string;
  },
) {
  const now = nowMs();
  const start = toMs(a.startAt);
  const end = a.endAt ? toMs(a.endAt) : a.allDay ? null : start + 3600_000;
  const r = ctx.db
    .prepare(
      `INSERT INTO events (title, start_at, end_at, all_day, color, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(a.title, start, end, a.allDay ? 1 : 0, a.color ?? null, a.notes ?? null, now, now);
  return `Created event "${a.title}" on ${fmtWhen(start)}${end ? `–${fmtWhen(end)}` : ""} (id ${Number(r.lastInsertRowid)}).`;
}

function toolListEvents(ctx: VaultCtx, a: { fromMs?: number; toMs?: number; limit?: number }) {
  const now = nowMs();
  const from = a.fromMs ?? now;
  const to = a.toMs ?? now + 14 * 86_400_000;
  const rows = ctx.db
    .prepare(
      `SELECT id, title, start_at, end_at, all_day, notes FROM events
       WHERE start_at < ? AND (end_at IS NULL OR end_at >= ?)
       ORDER BY start_at LIMIT ?`,
    )
    .all(to, from, Math.min(a.limit ?? 50, 100)) as Array<
      Record<string, unknown> & {
        id: number;
        title: string;
        start_at: number;
      }
    >;
  if (rows.length === 0) return `(no events between ${fmtWhen(from)} and ${fmtWhen(to)})`;
  return rows
    .map(
      (r) =>
        `${r.all_day ? "ALL-DAY" : fmtWhen(r.start_at)} · ${r.title}` +
        (typeof r.notes === "string" ? ` — ${r.notes.slice(0, 80)}` : ""),
    )
    .join("\n");
}

// ------------------------------------------------------------------- goals

function toolCreateGoal(
  ctx: VaultCtx,
  a: {
    title: string;
    description?: string;
    targetDate?: string | null;
    milestones?: Array<{ title: string; dueDate?: string | null }>;
  },
) {
  const now = nowMs();
  const r = ctx.db
    .prepare(
      `INSERT INTO goals (title, description, target_date, progress_pct, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    )
    .run(a.title, a.description ?? null, a.targetDate ?? null, now, now);
  const goalId = Number(r.lastInsertRowid);
  for (const m of a.milestones ?? []) {
    ctx.db
      .prepare(
        "INSERT INTO goal_milestones (goal_id, title, due_date, done, created_at) VALUES (?, ?, ?, 0, ?)",
      )
      .run(goalId, m.title, m.dueDate ?? null, now);
  }
  return `Created goal #${goalId} "${a.title}"${a.targetDate ? ` (target ${a.targetDate})` : ""} with ${a.milestones?.length ?? 0} milestone(s).`;
}

function toolUpdateGoal(
  ctx: VaultCtx,
  a: {
    id: number;
    title?: string;
    description?: string | null;
    targetDate?: string | null;
    progressPct?: number;
    addMilestone?: { title: string; dueDate?: string | null };
  },
) {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    params.push(v);
  };
  if (a.title !== undefined) push("title", a.title);
  if (a.description !== undefined) push("description", a.description);
  if (a.targetDate !== undefined) push("target_date", a.targetDate);
  if (a.progressPct !== undefined) push("progress_pct", a.progressPct);
  if (sets.length === 0 && !a.addMilestone) return "Nothing to update.";
  if (sets.length > 0) {
    sets.push("updated_at = ?");
    params.push(nowMs(), a.id);
    const r = ctx.db.prepare(`UPDATE goals SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    if (r.changes === 0) return `Goal #${a.id} does not exist.`;
  }
  if (a.addMilestone) {
    ctx.db
      .prepare(
        "INSERT INTO goal_milestones (goal_id, title, due_date, done, created_at) VALUES (?, ?, ?, 0, ?)",
      )
      .run(a.id, a.addMilestone.title, a.addMilestone.dueDate ?? null, nowMs());
  }
  const g = ctx.db
    .prepare("SELECT progress_pct FROM goals WHERE id = ?")
    .get(a.id) as { progress_pct: number } | undefined;
  return `Updated goal #${a.id}${g ? ` (progress ${g.progress_pct}%)` : ""}.`;
}

function toolListGoals(ctx: VaultCtx, a: { limit?: number }) {
  const rows = ctx.db
    .prepare(
      `SELECT g.id, g.title, g.target_date, g.progress_pct,
              (SELECT COUNT(*) FROM goal_milestones m WHERE m.goal_id = g.id) AS ms,
              (SELECT COUNT(*) FROM goal_milestones m WHERE m.goal_id = g.id AND m.done = 1) AS ms_done
       FROM goals g ORDER BY g.progress_pct ASC, g.target_date LIMIT ?`,
    )
    .all(Math.min(a.limit ?? 50, 100)) as Array<
      Record<string, unknown> & {
        id: number;
        title: string;
        progress_pct: number;
      }
    >;
  if (rows.length === 0) return "(no goals)";
  return rows
    .map(
      (r) =>
        `#${r.id} ${r.title} — ${r.progress_pct}%` +
        (r.target_date ? ` · target ${r.target_date}` : "") +
        (Number(r.ms) > 0 ? ` · ${r.ms_done}/${r.ms} milestones` : ""),
    )
    .join("\n");
}

// ------------------------------------------------------------------ exams

function toolExamProgress(ctx: VaultCtx, a: { topic: string; progressPct: number }) {
  const r = ctx.db
    .prepare("UPDATE exam_topics SET progress_pct = ?, updated_at = ? WHERE LOWER(name) = LOWER(?)")
    .run(a.progressPct, nowMs(), a.topic);
  if (r.changes === 0) {
    const topics = ctx.db
      .prepare(
        `SELECT s.name || " / " || t.name AS label, t.progress_pct
         FROM exam_topics t JOIN exam_subjects s ON s.id = t.subject_id
         ORDER BY s.name, t.name LIMIT 30`,
      )
      .all() as Array<{ label: string; progress_pct: number }>;
    return `No exam topic named "${a.topic}". Available topics:\n${topics
      .map((t) => `${t.label} (${t.progress_pct}%)`)
      .join("\n")}`;
  }
  return `Set "${a.topic}" to ${a.progressPct}% preparation.`;
}

// -------------------------------------------------------------------- time

function toolTimeLog(
  ctx: VaultCtx,
  a: {
    taskId?: number;
    projectId?: number;
    durationMin?: number;
    durationSec?: number;
    startedAt?: string | number;
    note?: string;
  },
) {
  const durationSec = a.durationSec ?? (a.durationMin ? Math.round(a.durationMin * 60) : undefined);
  if (!durationSec || durationSec <= 0) {
    return "Provide durationMin or durationSec (> 0).";
  }
  const started = a.startedAt ? toMs(a.startedAt) : nowMs() - durationSec;
  const r = ctx.db
    .prepare(
      `INSERT INTO time_entries (task_id, project_id, started_at, duration_sec, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(a.taskId ?? null, a.projectId ?? null, started, durationSec, a.note ?? null, nowMs());
  const where =
    [a.taskId ? `task #${a.taskId}` : "", a.projectId ? `project #${a.projectId}` : ""]
      .filter(Boolean)
      .join(", ") || "unassigned";
  return `Logged ${Math.round(durationSec / 60)} min on ${where} (${fmtWhen(started)}).`;
}

// --------------------------------------------------------------- data_query

function toolDataQuery(_ctx: VaultCtx, a: { sql: string }) {
  try {
    return formatRows(runDataQuery(a.sql));
  } catch (e) {
    if (e instanceof DataQueryError) return `REJECTED: ${e.message}`;
    throw e;
  }
}

// ------------------------------------------------------------------ memory

function toolSaveMemory(ctx: VaultCtx, a: { point: string; category?: string }) {
  const item = addMemory(ctx.db, a.point, a.category);
  return `Saved to permanent memory #${item.id}: "${item.point}".`;
}

function toolListMemories(ctx: VaultCtx) {
  const items = listMemories(ctx.db);
  if (items.length === 0) return "(no permanent memories stored)";
  return items.map((m) => `#${m.id} [${m.category}] ${m.point}`).join("\n");
}

function toolDeleteMemory(ctx: VaultCtx, a: { id: number }) {
  const ok = deleteMemory(ctx.db, a.id);
  if (!ok) return `Memory #${a.id} not found.`;
  return `Deleted permanent memory #${a.id}.`;
}

// -------------------------------------------------------------- calculation

function toolCalculate(_ctx: VaultCtx, a: { expression: string }) {
  try {
    const raw = a.expression.trim();
    if (!raw) return "Expression cannot be empty.";
    const expr = raw
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/\^/g, "**");

    // Whitelist safe math characters and tokens
    if (
      !/^[0-9+\-*/().,%^ \t_eE]|Math\.[a-zA-Z0-9_]+|pi|PI|sqrt|sin|cos|tan|log|pow|abs|round|floor|ceil/.test(
        expr,
      )
    ) {
      return "Expression contains invalid mathematical characters.";
    }

    const safeEval = new Function(
      "Math",
      `"use strict";
       const { sqrt, sin, cos, tan, log, log10, pow, abs, round, floor, ceil, PI, E } = Math;
       const pi = PI;
       return (${expr});`,
    );
    const val = safeEval(Math);
    if (typeof val !== "number" || !Number.isFinite(val)) {
      return `Result: ${String(val)}`;
    }
    return `Result: ${val}`;
  } catch (e) {
    return `Calculation error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ---------------------------------------------------------------- web skills

async function toolWebSearch(_ctx: VaultCtx, a: { query: string; limit?: number }) {
  return await performWebSearch(a.query, a.limit ?? 5);
}

async function toolWebFetch(_ctx: VaultCtx, a: { url: string; maxChars?: number }) {
  return await performWebFetch(a.url, a.maxChars ?? 15_000);
}

// ---------------------------------------------------------------- registry

let registered = false;

export function ensureAgentTools(): void {
  if (registered) return;
  registered = true;

  const reg = (
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    fn: (ctx: VaultCtx, a: never) => Promise<string> | string,
    destructive = false,
    schema?: z.ZodTypeAny,
  ) => {
    registerTool({
      spec: { type: "function", function: { name, description, parameters } },
      destructive,
      schema,
      run: (args, c) => fn(c, args as never),
    });
  };

  const P = (
    _name: string,
    _doc: string,
    req: Record<string, unknown>,
    opt: Record<string, unknown> = {},
  ) => ({
    type: "object",
    properties: { ...req, ...opt },
    required: Object.keys(req),
  });

  reg(
    "list_files",
    "List the contents of a directory in the user's vault. Use \"/\" for the root. Returns paths with type and size.",
    P(
      "list_files",
      "List vault directory",
      {},
      { path: { type: "string", description: "Directory path to list (default \"/\")" } },
    ),
    toolListFiles,
  );

  reg(
    "read_file",
    "Read the full content of a vault file. Text files return their content; binary files return a description only.",
    P("read_file", "Read a vault file", {
      path: { type: "string", description: "File path, e.g. /notes/milk.md" },
    }),
    toolReadFile,
  );

  reg(
    "write_file",
    "Create or overwrite a text file in the vault. Creates parent directories as needed. A version snapshot of the previous content is kept automatically.",
    P(
      "write_file",
      "Write a vault file",
      {
        path: { type: "string", description: "File path, e.g. /notes/groceries.md" },
        content: { type: "string", description: "Full new file content" },
      },
    ),
    toolWriteFile,
    true,
  );

  reg(
    "create_directory",
    "Create a directory in the vault (parents are created automatically).",
    P("create_directory", "Create a vault directory", {
      path: { type: "string", description: "Directory path" },
    }),
    toolCreateDir,
    true,
  );

  reg(
    "move_file",
    "Move or rename a file or directory in the vault.",
    P(
      "move_file",
      "Move a vault path",
      { from: { type: "string" }, to: { type: "string" } },
    ),
    toolMoveFile,
    true,
  );

  reg(
    "delete_file",
    "Move a vault file or directory to the trash (restorable). Use for destructive user requests.",
    P("delete_file", "Trash a vault path", { path: { type: "string" } }),
    toolDeleteFile,
    true,
  );

  reg(
    "search_files",
    'Full-text search over file names/paths AND text-file content in the vault. Use for "find files mentioning X".',
    P(
      "search_files",
      "Search the vault",
      { query: { type: "string", description: "Search term(s)" } },
      { limit: { type: "number", description: "Max hits (default 25)" } },
    ),
    toolSearchFiles,
  );

  reg(
    "create_project",
    "Create a new project in the user's project tracker.",
    P(
      "create_project",
      "Create a project",
      { title: { type: "string" } },
      {
        description: { type: "string" },
        color: { type: "string", description: "Hex color, e.g. #3b82f6" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
      },
    ),
    toolCreateProject,
  );

  reg(
    "list_projects",
    "List projects with task counts. Archived projects are hidden unless includeArchived is true.",
    P(
      "list_projects",
      "List projects",
      {},
      {
        status: { type: "string", description: "Filter: active | archived | ..." },
        includeArchived: { type: "boolean" },
      },
    ),
    toolListProjects,
  );

  reg(
    "update_project",
    "Update fields on an existing project.",
    P(
      "update_project",
      "Update a project",
      { id: { type: "number", description: "Project id" } },
      {
        title: { type: "string" },
        description: { type: "string", nullable: true },
        color: { type: "string" },
        status: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
      },
    ),
    toolUpdateProject,
  );

  reg(
    "delete_project",
    "Permanently delete a project and its tasks, dependencies and time entries.",
    P("delete_project", "Delete a project", { id: { type: "number" } }),
    toolDeleteProject,
    true,
    z.object({ id: z.number() }),
  );

  reg(
    "create_task",
    "Create a task (optionally under a project).",
    P(
      "create_task",
      "Create a task",
      { title: { type: "string" } },
      {
        projectId: { type: "number", nullable: true },
        description: { type: "string" },
        priority: { type: "number", description: "0–3, 3 is highest (default 1)" },
        status: { type: "string", enum: ["todo", "doing", "done"] },
        dueDate: { type: "string", description: "YYYY-MM-DD" },
        tags: { type: "array", items: { type: "string" } },
      },
    ),
    toolCreateTask,
  );

  reg(
    "list_tasks",
    "List tasks, optionally filtered by project and/or status.",
    P(
      "list_tasks",
      "List tasks",
      {},
      {
        projectId: { type: "number" },
        status: { type: "string", enum: ["todo", "doing", "done"] },
        limit: { type: "number" },
      },
    ),
    toolListTasks,
  );

  reg(
    "update_task",
    "Update a task's fields (title, status, priority, due date, tags).",
    P(
      "update_task",
      "Update a task",
      { id: { type: "number" } },
      {
        title: { type: "string" },
        description: { type: "string", nullable: true },
        status: { type: "string", enum: ["todo", "doing", "done"] },
        priority: { type: "number" },
        dueDate: { type: "string", nullable: true, description: "YYYY-MM-DD, null to clear" },
        tags: { type: "array", items: { type: "string" } },
      },
    ),
    toolUpdateTask,
  );

  reg(
    "create_event",
    "Add a calendar event to the user's local calendar.",
    P(
      "create_event",
      "Create a calendar event",
      {
        title: { type: "string" },
        startAt: {
          type: "string",
          description:
            "ISO 8601 (e.g. 2026-10-13T15:00:00) or epoch milliseconds; YYYY-MM-DD for all-day events",
        },
      },
      {
        endAt: { type: "string", description: "Same format as startAt (default: start + 1 h)" },
        allDay: { type: "boolean" },
        color: { type: "string" },
        notes: { type: "string" },
      },
    ),
    toolCreateEvent,
  );

  reg(
    "list_events",
    "List calendar events in a time window (default: now → +14 days).",
    P(
      "list_events",
      "List calendar events",
      {},
      {
        fromMs: { type: "number", description: "Window start (epoch ms)" },
        toMs: { type: "number", description: "Window end (epoch ms)" },
        limit: { type: "number" },
      },
    ),
    toolListEvents,
  );

  reg(
    "create_goal",
    "Create a long-term goal with optional target date and milestones.",
    P(
      "create_goal",
      "Create a goal",
      { title: { type: "string" } },
      {
        description: { type: "string" },
        targetDate: { type: "string", description: "YYYY-MM-DD" },
        milestones: {
          type: "array",
          description: "Milestones to attach",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              dueDate: { type: "string", description: "YYYY-MM-DD" },
            },
            required: ["title"],
          },
        },
      },
    ),
    toolCreateGoal,
  );

  reg(
    "update_goal",
    "Update a goal's progress (0–100), target date, or add a milestone.",
    P(
      "update_goal",
      "Update a goal",
      { id: { type: "number" } },
      {
        title: { type: "string" },
        description: { type: "string", nullable: true },
        targetDate: { type: "string" },
        progressPct: { type: "number", minimum: 0, maximum: 100 },
        addMilestone: {
          type: "object",
          properties: {
            title: { type: "string" },
            dueDate: { type: "string" },
          },
          required: ["title"],
        },
      },
    ),
    toolUpdateGoal,
  );

  reg(
    "list_goals",
    "List goals with progress and milestone counts, least-progressed first.",
    P("list_goals", "List goals", {}, { limit: { type: "number" } }),
    toolListGoals,
  );

  reg(
    "exam_progress_update",
    "Set the preparation progress of an exam topic to a percentage (0–100). If the topic name is not found, the result lists available topics.",
    P(
      "exam_progress_update",
      "Update exam topic progress",
      {
        topic: { type: "string", description: "Exact exam topic name" },
        progressPct: { type: "number", minimum: 0, maximum: 100 },
      },
    ),
    toolExamProgress,
    false,
    z.object({
      topic: z.string().min(1),
      progressPct: z.number().int().min(0).max(100),
    }),
  );

  reg(
    "time_log",
    "Log a block of work time (manually, e.g. after the user says 'I studied 90 minutes').",
    P(
      "time_log",
      "Log time spent",
      {
        durationMin: {
          type: "number",
          description: "Minutes worked (preferred) — or use durationSec",
        },
      },
      {
        taskId: { type: "number", nullable: true },
        projectId: { type: "number", nullable: true },
        durationSec: { type: "number" },
        startedAt: {
          type: "string",
          description: "ISO or epoch ms when the work started (default: now minus the duration)",
        },
        note: { type: "string" },
      },
    ),
    toolTimeLog,
    false,
    z.object({
      durationMin: z.number().positive().optional(),
      durationSec: z.number().positive().optional(),
    }),
  );

  reg(
    "data_query",
    "Run a READ-ONLY SQL query against the vault database (tables: projects, tasks, time_entries, events, goals, goal_milestones, exam_subjects, exam_topics, study_logs, files). Must be SELECT/WITH only; LIMIT 200 is forced. Use for aggregated answers the other tools don't cover.",
    P(
      "data_query",
      "Read-only SQL over the vault",
      { sql: { type: "string", description: "A single SELECT or WITH statement" } },
    ),
    toolDataQuery,
    false,
    z.object({ sql: z.string().min(1).max(4000) }),
  );

  reg(
    "save_memory",
    "Permanently save a personal fact, preference, key date, or instruction that the user asked to remember (e.g. 'remember that I am studying for GATE', 'yaad rakhna ki mujhe maths pasand hai'). This memory persists across all future conversations.",
    P(
      "save_memory",
      "Save permanent memory",
      { point: { type: "string", description: "Fact or preference to remember permanently" } },
      { category: { type: "string", description: "Optional category tag (e.g. 'preference', 'exam', 'profile')" } },
    ),
    toolSaveMemory,
    false,
    z.object({ point: z.string().min(1), category: z.string().optional() }),
  );

  reg(
    "list_memories",
    "List all permanently remembered facts and user preferences.",
    P("list_memories", "List memories", {}),
    toolListMemories,
  );

  reg(
    "delete_memory",
    "Delete a permanent memory by its numeric ID.",
    P(
      "delete_memory",
      "Delete a memory",
      { id: { type: "number", description: "Memory ID to forget" } },
    ),
    toolDeleteMemory,
    false,
    z.object({ id: z.number() }),
  );

  reg(
    "calculate",
    "Safely evaluate a mathematical expression with standard operators (+, -, *, /, ^, %) and functions (sqrt, sin, cos, tan, log, pow, abs, round, floor, ceil, pi, e). Use whenever you need exact numerical calculation to avoid arithmetic mistakes.",
    P(
      "calculate",
      "Calculate mathematical expression",
      { expression: { type: "string", description: "Math expression, e.g. '(150 * 0.18) + 42' or 'sqrt(144) * 3'" } },
    ),
    toolCalculate,
    false,
    z.object({ expression: z.string().min(1) }),
  );

  reg(
    "web_search",
    "Search the web for up-to-date information, documentation, news, or facts. Returns top search results with titles, URLs, and snippets.",
    P(
      "web_search",
      "Search the web",
      { query: { type: "string", description: "Web search query" } },
      { limit: { type: "number", description: "Number of results to return (default 5, max 10)" } },
    ),
    toolWebSearch,
    false,
    z.object({ query: z.string().min(1), limit: z.number().optional() }),
  );

  reg(
    "web_fetch",
    "Fetch and extract readable text/markdown from a public web page URL. Use after web_search to read an entire article or documentation page.",
    P(
      "web_fetch",
      "Fetch webpage content",
      { url: { type: "string", description: "Full URL (http:// or https://)" } },
      { maxChars: { type: "number", description: "Max characters to extract (default 15000)" } },
    ),
    toolWebFetch,
    false,
    z.object({ url: z.string().min(1), maxChars: z.number().optional() }),
  );
}

/** Test hook */
export function _resetAgentTools(): void {
  registered = false;
}
