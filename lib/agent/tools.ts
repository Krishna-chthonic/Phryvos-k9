/**
 * Agent tools for phryvos-k9.
 *
 * Importers/callers: lib/agent/loop.ts
 * Affected API: Agent SSE tool execution
 * Data schemas if any: All vault tables + memories table + file_chunks + memory_consolidation
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
import { parsePdfBuffer } from "./pdf-reader";
import {
  inspectZipBuffer,
  readZipEntry,
  extractZipToVault,
} from "./zip-reader";
import { analyzeDataContent } from "./data-analyzer";
import { runSandboxedJs } from "./code-runner";
import {
  listExamSubjectsWithTopics,
  logExamStudySession,
} from "./study-manager";
import {
  upsertFileChunks,
  searchChunks,
  reindexAllFiles,
  getRagStats,
} from "@/lib/vector/rag";
import {
  storeSTM,
  recallSTM,
  getAllSTM,
  runConsolidationJob,
  getConsolidationStats,
} from "@/lib/memory/consolidation";
import { runTotDerivation, getTotConfig } from "./tot";
import { createRouter, classifyIntent, type IntentCategory, type ModelTier, INTENT_TO_TIER, INTENT_KEYWORDS } from "@/lib/ai/router";
import { JEE_PROBLEMS, getProblemConfig, getProblemDescription, type PhysicsProblemType, type ProblemConfig } from "@/lib/physics/arena";
import {
  loadAndRegisterCustomSkills,
  toolInstallSkill,
  toolListSkills,
  toolRemoveSkill,
} from "./custom-skills";
import { getDb } from "@/lib/db/client";
import { listDots, createDotTask } from "@/lib/dots-service";
import {
  ensureDotWorktree,
  getDotWorktreeInfo,
  mergeDotWorktree,
  removeDotWorktree,
} from "@/lib/dots/worktree-service";
import { synthesizeSkill } from "./skill-synthesizer";
import {
  storeReMeMemory,
  recallReMeMemories,
  runReMeDreamCycle,
} from "@/lib/memory/reme-service";
import { listRecipes, executeRecipe } from "@/lib/recipes/recipe-runner";
import {
  reachWeb,
  reachGithub,
  reachReddit,
  reachYouTube,
  reachTweet,
  reachRss,
  runAgentReachDoctor,
} from "./reach-service";
import { OpenBrowserEngine } from "@/lib/browser/openbrowser-engine";
import { aipexBridge } from "@/lib/browser/aipex-bridge";
import { browserSkill } from "@/lib/browser/browserskill-engine";
import { hybridDigUpSearch, indexVaultForDigUp, getDigUpStats } from "@/lib/search/digup-engine";
import { swarmEngine, type SwarmTopology } from "@/lib/swarm/swarm-engine";
import {
  getOrcaFleet,
  createOrcaWorktree,
  getOrcaWorktreeDiff,
  dryRunOrcaMerge,
  mergeAndPruneOrcaWorktree,
} from "@/lib/orca/orca-engine";
import { paperclipEngine } from "@/lib/paperclip/paperclip-engine";
import { ifixaiEngine } from "@/lib/audit/ifixai-engine";
import { eccEngine, type RuleCategory } from "@/lib/ecc/ecc-engine";
import { hermesEngine } from "@/lib/hermes/hermes-engine";

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

async function toolReadFile(ctx: VaultCtx, a: { path: string }) {
  const { bytes, mime } = readFile(ctx, a.path);
  if (bytes.length === 0) return "(empty file)";

  const lowerPath = a.path.toLowerCase();

  // Smart PDF extraction
  if (lowerPath.endsWith(".pdf") || mime === "application/pdf") {
    try {
      const res = await parsePdfBuffer(bytes);
      return `[PDF Document: ${res.pages} page(s), ${fmtSize(bytes.length)}]\n\n${res.text}`;
    } catch (e) {
      return `[PDF Document (${fmtSize(bytes.length)}) — error parsing text: ${e instanceof Error ? e.message : String(e)}]`;
    }
  }

  // Smart ZIP archive inspection
  if (
    lowerPath.endsWith(".zip") ||
    mime === "application/zip" ||
    mime === "application/x-zip-compressed"
  ) {
    try {
      const res = inspectZipBuffer(bytes);
      const fileList = res.entries
        .slice(0, 50)
        .map(
          (e) =>
            `${e.isDirectory ? "dir " : "file"} ${e.name} (${fmtSize(e.sizeBytes)})`,
        )
        .join("\n");
      const overflow =
        res.entries.length > 50
          ? `\n… [${res.entries.length - 50} more entries]`
          : "";
      return `[ZIP Archive: ${res.totalEntries} entries, uncompressed ${fmtSize(res.totalUncompressedBytes)}]\n\nEntries:\n${fileList}${overflow}\n\nTip: Use tool 'read_zip_entry' with entryPath to read individual files inside this archive, or 'extract_zip' to unpack it into a vault folder.`;
    } catch (e) {
      return `[ZIP Archive (${fmtSize(bytes.length)}) — error inspecting entries: ${e instanceof Error ? e.message : String(e)}]`;
    }
  }

  if (!isTextMime(mime)) {
    return `Binary file (${mime ?? "unknown type"}, ${fmtSize(bytes.length)}) — content not displayed.`;
  }
  const text = bytes.toString("utf8");
  const cap = 100_000;
  return text.length > cap
    ? `${text.slice(0, cap)}\n… [${text.length - cap} more chars, read in a narrower range or search instead]`
    : text;
}

async function toolReadPdf(ctx: VaultCtx, a: { path: string; maxPages?: number }) {
  const { bytes } = readFile(ctx, a.path);
  if (bytes.length === 0) return `File ${a.path} is empty.`;
  const res = await parsePdfBuffer(bytes, a.maxPages);
  let header = `[PDF: ${a.path} | ${res.pages} page(s), ${fmtSize(bytes.length)}]`;
  if (res.info && typeof res.info === "object") {
    const meta = res.info as Record<string, unknown>;
    if (meta.Title) header += `\nTitle: ${String(meta.Title)}`;
    if (meta.Author) header += `\nAuthor: ${String(meta.Author)}`;
  }
  return `${header}\n\n${res.text}`;
}

function toolInspectZip(ctx: VaultCtx, a: { path: string }) {
  const { bytes } = readFile(ctx, a.path);
  if (bytes.length === 0) return `File ${a.path} is empty.`;
  const res = inspectZipBuffer(bytes);
  const rows = res.entries.map(
    (e) => `${e.isDirectory ? "📁 dir " : "📄 file"} ${e.name} (${fmtSize(e.sizeBytes)})`,
  );
  return `ZIP Archive "${a.path}": ${res.totalEntries} items (uncompressed total ${fmtSize(res.totalUncompressedBytes)})\n\n${rows.join("\n")}`;
}

function toolReadZipEntry(
  ctx: VaultCtx,
  a: { zipPath: string; entryPath: string; maxChars?: number },
) {
  const { bytes } = readFile(ctx, a.zipPath);
  if (bytes.length === 0) return `File ${a.zipPath} is empty.`;
  const res = readZipEntry(bytes, a.entryPath, a.maxChars);
  if (!res.found) {
    return `File "${a.entryPath}" was not found inside "${a.zipPath}". Use 'inspect_zip' to check available paths.`;
  }
  if (res.isDirectory) {
    return `"${a.entryPath}" is a directory inside the archive, not a file.`;
  }
  return `Content of "${res.name}" inside "${a.zipPath}" (${fmtSize(res.sizeBytes)}):\n\n${res.content}`;
}

function toolExtractZip(ctx: VaultCtx, a: { zipPath: string; destinationDir: string }) {
  const { bytes } = readFile(ctx, a.zipPath);
  if (bytes.length === 0) return `File ${a.zipPath} is empty.`;
  const res = extractZipToVault(ctx, bytes, a.destinationDir);
  return `Successfully extracted ${res.extractedCount} file(s) (${fmtSize(res.totalBytes)}) from "${a.zipPath}" into "${a.destinationDir}".`;
}

function toolAnalyzeDataFile(ctx: VaultCtx, a: { path: string }) {
  const { bytes } = readFile(ctx, a.path);
  if (bytes.length === 0) return `File ${a.path} is empty.`;
  const text = bytes.toString("utf8");
  return analyzeDataContent(text, a.path);
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

function toolUpdateEvent(
  ctx: VaultCtx,
  a: {
    id: number;
    title?: string;
    startAt?: string | number;
    endAt?: string | number | null;
    allDay?: boolean;
    color?: string | null;
    notes?: string | null;
  },
) {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    params.push(v);
  };
  if (a.title !== undefined) push("title", a.title);
  if (a.startAt !== undefined) push("start_at", toMs(a.startAt));
  if (a.endAt !== undefined) push("end_at", a.endAt ? toMs(a.endAt) : null);
  if (a.allDay !== undefined) push("all_day", a.allDay ? 1 : 0);
  if (a.color !== undefined) push("color", a.color ?? null);
  if (a.notes !== undefined) push("notes", a.notes ?? null);
  if (sets.length === 0) return "Nothing to update on event.";
  sets.push("updated_at = ?");
  params.push(nowMs(), a.id);
  const r = ctx.db.prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  if (r.changes === 0) return `Event #${a.id} not found.`;
  return `Updated event #${a.id}.`;
}

function toolDeleteEvent(ctx: VaultCtx, a: { id: number }) {
  const r = ctx.db.prepare("DELETE FROM events WHERE id = ?").run(a.id);
  if (r.changes === 0) return `Event #${a.id} not found.`;
  return `Deleted event #${a.id}.`;
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

function toolListExamTopics(ctx: VaultCtx) {
  return listExamSubjectsWithTopics(ctx);
}

function toolLogStudySession(
  ctx: VaultCtx,
  a: {
    durationMin: number;
    topicName?: string;
    subjectName?: string;
    notes?: string;
  },
) {
  return logExamStudySession(ctx, a);
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
  try {
    const item = addMemory(ctx.db, a.point, a.category, { source: "agent" });
    return `Saved to permanent memory #${item.id}: "${item.point}".`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Refused to save memory: ${msg}`;
  }
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

/**
 * Strict AST-based / recursive-descent math expression evaluator with zero eval/new Function.
 * Completely isolates computation to arithmetic primitives and safe Math functions.
 */
function evaluateMathExpression(rawExpr: string): number {
  const sanitized = rawExpr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\*\*/g, "^");

  type TokenType = "NUMBER" | "IDENT" | "OP" | "LPAREN" | "RPAREN" | "COMMA";
  interface Token {
    type: TokenType;
    value: string | number;
  }

  const tokens: Token[] = [];
  let i = 0;
  const len = sanitized.length;

  while (i < len) {
    const ch = sanitized[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let numStr = "";
      while (i < len && /[0-9.]/.test(sanitized[i])) {
        numStr += sanitized[i];
        i++;
      }
      if (i < len && (sanitized[i] === "e" || sanitized[i] === "E")) {
        numStr += sanitized[i];
        i++;
        if (i < len && (sanitized[i] === "+" || sanitized[i] === "-")) {
          numStr += sanitized[i];
          i++;
        }
        while (i < len && /[0-9]/.test(sanitized[i])) {
          numStr += sanitized[i];
          i++;
        }
      }
      const num = Number(numStr);
      if (Number.isNaN(num)) throw new Error(`Invalid numeric literal: ${numStr}`);
      tokens.push({ type: "NUMBER", value: num });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (i < len && /[a-zA-Z0-9_]/.test(sanitized[i])) {
        ident += sanitized[i];
        i++;
      }
      tokens.push({ type: "IDENT", value: ident.toLowerCase() });
      continue;
    }

    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
      continue;
    }

    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
      continue;
    }

    if (ch === ",") {
      tokens.push({ type: "COMMA", value: "," });
      i++;
      continue;
    }

    if (["+", "-", "*", "/", "%", "^"].includes(ch)) {
      tokens.push({ type: "OP", value: ch });
      i++;
      continue;
    }

    throw new Error(`Unexpected character in expression: '${ch}'`);
  }

  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function consume(expectedType?: TokenType, expectedVal?: string): Token {
    const t = tokens[pos];
    if (!t) throw new Error("Unexpected end of expression");
    if (expectedType && t.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but found ${t.type} (${t.value})`);
    }
    if (expectedVal && String(t.value) !== expectedVal) {
      throw new Error(`Expected '${expectedVal}' but found '${t.value}'`);
    }
    pos++;
    return t;
  }

  function parseExpression(): number {
    let val = parseTerm();
    while (pos < tokens.length) {
      const next = peek();
      if (next && next.type === "OP" && (next.value === "+" || next.value === "-")) {
        consume();
        const rhs = parseTerm();
        val = next.value === "+" ? val + rhs : val - rhs;
      } else {
        break;
      }
    }
    return val;
  }

  function parseTerm(): number {
    let val = parsePower();
    while (pos < tokens.length) {
      const next = peek();
      if (next && next.type === "OP" && (next.value === "*" || next.value === "/" || next.value === "%")) {
        consume();
        const rhs = parsePower();
        if (next.value === "*") val = val * rhs;
        else if (next.value === "/") {
          if (rhs === 0) throw new Error("Division by zero");
          val = val / rhs;
        } else {
          val = val % rhs;
        }
      } else {
        break;
      }
    }
    return val;
  }

  function parsePower(): number {
    const base = parseFactor();
    const next = peek();
    if (next && next.type === "OP" && next.value === "^") {
      consume();
      const exp = parsePower();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseFactor(): number {
    const next = peek();
    if (next && next.type === "OP" && (next.value === "+" || next.value === "-")) {
      consume();
      const operand = parseFactor();
      return next.value === "-" ? -operand : operand;
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = peek();
    if (!t) throw new Error("Unexpected end of expression");

    if (t.type === "NUMBER") {
      consume();
      return Number(t.value);
    }

    if (t.type === "LPAREN") {
      consume();
      const val = parseExpression();
      consume("RPAREN", ")");
      return val;
    }

    if (t.type === "IDENT") {
      consume();
      const name = String(t.value).toLowerCase();

      if (name === "pi") return Math.PI;
      if (name === "e") return Math.E;

      const next = peek();
      if (next && next.type === "LPAREN") {
        consume("LPAREN", "(");
        const args: number[] = [];
        if (peek() && peek()?.type !== "RPAREN") {
          args.push(parseExpression());
          while (peek() && peek()?.type === "COMMA") {
            consume("COMMA", ",");
            args.push(parseExpression());
          }
        }
        consume("RPAREN", ")");

        switch (name) {
          case "sqrt":
            return Math.sqrt(args[0] ?? 0);
          case "cbrt":
            return Math.cbrt(args[0] ?? 0);
          case "abs":
            return Math.abs(args[0] ?? 0);
          case "round":
            return Math.round(args[0] ?? 0);
          case "floor":
            return Math.floor(args[0] ?? 0);
          case "ceil":
            return Math.ceil(args[0] ?? 0);
          case "sin":
            return Math.sin(args[0] ?? 0);
          case "cos":
            return Math.cos(args[0] ?? 0);
          case "tan":
            return Math.tan(args[0] ?? 0);
          case "log":
            return Math.log(args[0] ?? 0);
          case "log10":
            return Math.log10(args[0] ?? 0);
          case "log2":
            return Math.log2(args[0] ?? 0);
          case "exp":
            return Math.exp(args[0] ?? 0);
          case "pow":
            return Math.pow(args[0] ?? 0, args[1] ?? 1);
          case "min":
            return Math.min(...args);
          case "max":
            return Math.max(...args);
          default:
            throw new Error(`Unknown mathematical function: ${name}`);
        }
      }

      throw new Error(`Unknown identifier or constant: ${name}`);
    }

    throw new Error(`Unexpected token: ${t.type} (${t.value})`);
  }

  const result = parseExpression();
  if (pos < tokens.length) {
    throw new Error(`Unexpected extra tokens after expression: ${tokens[pos].value}`);
  }
  return result;
}

function toolCalculate(_ctx: VaultCtx, a: { expression: string }) {
  try {
    const raw = a.expression?.trim();
    if (!raw) return "Expression cannot be empty.";
    const val = evaluateMathExpression(raw);
    if (typeof val !== "number" || !Number.isFinite(val)) {
      return `Result: ${String(val)}`;
    }
    return `Result: ${val}`;
  } catch (e) {
    return `Calculation error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function toolRunJsCode(_ctx: VaultCtx, a: { code: string }) {
  const res = runSandboxedJs(a.code);
  if (!res.success) {
    return `Execution Error (${res.durationMs}ms):\n${res.error}${res.output ? `\n\nLogs prior to error:\n${res.output}` : ""}`;
  }
  return `Execution Success (${res.durationMs}ms):\n${res.output}`;
}

// ---------------------------------------------------------------- RAG (Vector Search)

async function toolSearchChunks(ctx: VaultCtx, a: { query: string; k?: number; filePaths?: string[] }) {
  const results = await searchChunks(ctx, a.query, a.k ?? 5, a.filePaths);
  if (results.length === 0) return `No relevant chunks found for "${a.query}".`;
  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.filePath} (chunk ${r.chunkIndex}, score ${r.score.toFixed(3)}, ${r.tokenCount} tokens):\n${r.content.slice(0, 500)}${r.content.length > 500 ? "…" : ""}`,
    )
    .join("\n\n");
}

async function toolReindexVault(ctx: VaultCtx) {
  const result = await reindexAllFiles(ctx);
  return `Reindexed ${result.files} files, created ${result.chunks} chunks.`;
}

async function toolRagStats(ctx: VaultCtx) {
  const stats = await getRagStats(ctx);
  return `Vector RAG Stats:\n- Files indexed: ${stats.totalFiles}\n- Total chunks: ${stats.totalChunks}\n- Embedding models: ${stats.models.join(", ") || "none"}`;
}

// ---------------------------------------------------------------- Memory Consolidation (STM → LTM)

async function toolStoreSTM(ctx: VaultCtx, a: { key: string; fact: string; context?: string; source?: string; confidence?: number }) {
  await storeSTM(ctx, a.key, a.fact, a.context ?? "", a.source ?? "agent", a.confidence ?? 1.0);
  return `Stored in STM: "${a.key}" → "${a.fact}"`;
}

async function toolRecallSTM(ctx: VaultCtx, a: { key: string }) {
  const record = await recallSTM(ctx, a.key);
  if (!record) return `No STM entry for key "${a.key}".`;
  const parsed = JSON.parse(record.stmValue);
  return `STM Recall "${a.key}":\nFact: ${parsed.fact}\nContext: ${parsed.context}\nSource: ${parsed.source}\nAccess count: ${record.stmAccessCount}\nDecay score: ${record.decayScore.toFixed(3)}`;
}

async function toolListSTM(ctx: VaultCtx) {
  const records = await getAllSTM(ctx);
  if (records.length === 0) return "(STM empty)";
  return records
    .map((r) => {
      const parsed = JSON.parse(r.stmValue);
      return `#${r.id} [${r.decayScore.toFixed(3)} decay, ${r.stmAccessCount} accesses] ${parsed.fact}`;
    })
    .join("\n");
}

async function toolRunConsolidation(ctx: VaultCtx) {
  const result = await runConsolidationJob(ctx);
  return `Consolidation complete:\n- Clusters processed: ${result.clustersProcessed}\n- Facts promoted to LTM: ${result.factsPromoted}\n- STM records deleted: ${result.recordsDeleted}`;
}

async function toolConsolidationStats(ctx: VaultCtx) {
  const stats = await getConsolidationStats(ctx);
  return `Memory Consolidation Stats:\n- STM total: ${stats.stmTotal}\n- STM promoted: ${stats.stmPromoted}\n- STM active: ${stats.stmActive}\n- LTM total: ${stats.ltmTotal}\n- Average decay: ${stats.avgDecay.toFixed(3)}`;
}

// ---------------------------------------------------------------- Tree-of-Thought

async function toolRunTot(ctx: VaultCtx, a: { problem: string; knowns?: Record<string, string>; unknowns?: string[] }) {
  const result = await runTotDerivation(ctx, a.problem, a.knowns, a.unknowns);
  let output = `Tree-of-Thought Derivation for: ${a.problem}\n\n`;
  for (const step of result.steps) {
    output += `=== ${step.paradigm.toUpperCase()} ===\n`;
    output += `Confidence: ${(step.confidence * 100).toFixed(0)}%\n`;
    output += `Equations: ${step.equations.join(", ") || "none"}\n`;
    output += `Expression: ${step.finalExpression || "none"}\n`;
    output += `Reasoning: ${step.reasoning.slice(0, 300)}...\n\n`;
  }
  output += `=== SYNTHESIS ===\n`;
  output += `Best Expression: ${result.synthesis.bestExpression}\n`;
  output += `Best Paradigm: ${result.synthesis.bestParadigm}\n`;
  output += `Verification: dimensional=${result.synthesis.verification.dimensionalConsistent}, limits=${result.synthesis.verification.limitsAgree}, agreement=${(result.synthesis.verification.crossParadigmAgreement * 100).toFixed(0)}%\n\n`;
  output += `${result.synthesis.tradeoffs}`;
  return output;
}

// ---------------------------------------------------------------- Physics Arena

function toolListPhysicsProblems(_ctx: VaultCtx) {
  const entries = Object.entries(JEE_PROBLEMS);
  return entries
    .map(([key, config]: [string, ProblemConfig]) => {
      const desc = getProblemDescription(key as PhysicsProblemType);
      const params = Object.entries(config.parameters)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      return `${key}: ${desc}\n  Parameters: ${params}`;
    })
    .join("\n\n");
}

async function toolRenderPhysicsProblem(ctx: VaultCtx, a: { type: string; params?: Record<string, number> }) {
  if (!(a.type in JEE_PROBLEMS)) {
    const available = Object.keys(JEE_PROBLEMS).join(", ");
    return `Unknown problem type "${a.type}". Available: ${available}`;
  }
  const config = getProblemConfig(a.type as PhysicsProblemType, a.params);
  const desc = getProblemDescription(a.type as PhysicsProblemType);
  const paramsStr = Object.entries(config.parameters)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return `Physics Problem: ${a.type}\n${desc}\n\nParameters: ${paramsStr}\n\nUse the Artifact Drawer to run the interactive simulation.`;
}

// ---------------------------------------------------------------- Semantic Router

async function toolClassifyIntent(_ctx: VaultCtx, a: { text: string }) {
  const category = classifyIntent(a.text);
  const tier = INTENT_TO_TIER[category];
  return `Intent: ${category}\nTier: ${tier}\nKeywords matched: ${INTENT_KEYWORDS[category].join(", ")}`;
}

async function toolRouteIntent(ctx: VaultCtx, a: { text: string; providerId?: number; model?: string; tier?: ModelTier }) {
  const router = createRouter(ctx);
  const decision = await router.route(a.text, { providerId: a.providerId, model: a.model, tier: a.tier });
  return `Routing Decision:\n- Provider: ${decision.providerId}\n- Model: ${decision.model}\n- Tier: ${decision.tier}\n- Reasoning: ${decision.reasoning}`;
}

// ---------------------------------------------------------------- web skills

async function toolWebSearch(_ctx: VaultCtx, a: { query: string; limit?: number }) {
  return await performWebSearch(a.query, a.limit ?? 5);
}

async function toolWebFetch(_ctx: VaultCtx, a: { url: string; maxChars?: number }) {
  return await performWebFetch(a.url, a.maxChars ?? 15_000);
}

// ---------------------------------------------------------------- company & worktree tools

async function toolDelegateToDot(
  ctx: VaultCtx,
  a: { targetDot: string; taskPrompt: string; intervalSeconds?: number | null },
): Promise<string> {
  const dots = listDots(ctx);
  const target = a.targetDot.toLowerCase().trim();
  const matchedDot = dots.find(
    (d) =>
      d.name.toLowerCase() === target ||
      d.role.toLowerCase().includes(target) ||
      d.id.toLowerCase() === target,
  );

  if (!matchedDot) {
    const available = dots.map((d) => `"${d.name}" (${d.role})`).join(", ");
    return `Error: Coworker "${a.targetDot}" not found. Available company coworkers: ${available || "None configured"}`;
  }

  if (a.intervalSeconds !== undefined && a.intervalSeconds !== null) {
    if (a.intervalSeconds < 60) {
      return `Error: Minimum task interval is 60 seconds (got ${a.intervalSeconds}s). Sub-minute recurring intervals are rejected to prevent background execution runaway.`;
    }
    if (a.intervalSeconds > 31536000) {
      return `Error: Maximum task interval is 31,536,000 seconds (1 year).`;
    }
  }

  const task = createDotTask(ctx, matchedDot.id, {
    prompt: a.taskPrompt,
    intervalSeconds: a.intervalSeconds ?? null,
  });

  return `✔ Successfully delegated task to coworker ${matchedDot.name} (${matchedDot.role}):\nTask ID: ${task.id}\nPrompt: "${task.prompt}"\nSchedule: ${a.intervalSeconds ? `Every ${a.intervalSeconds}s` : "One-time immediate run"}\nStatus: Queued`;
}

async function toolManageWorktree(
  _ctx: VaultCtx,
  a: { action: "create" | "status" | "merge" | "remove"; dotName: string; targetBranch?: string },
): Promise<string> {
  const { action, dotName, targetBranch = "main" } = a;
  switch (action) {
    case "create": {
      const res = await ensureDotWorktree(dotName, targetBranch);
      return `✔ Worktree ready for ${dotName}:\nPath: ${res.worktreePath}\nBranch: ${res.branch}\nStatus: ${res.created ? "Newly initialized" : "Re-attached existing"}`;
    }
    case "status": {
      const info = await getDotWorktreeInfo(dotName);
      if (!info) return `No active worktree found for ${dotName}.`;
      return `Worktree Status for ${dotName}:\nBranch: ${info.branch}\nCommit: ${info.headCommit}\nClean: ${info.isClean}\nUncommitted: ${info.uncommittedFiles.length ? info.uncommittedFiles.join(", ") : "None"}`;
    }
    case "merge": {
      const res = await mergeDotWorktree(dotName, targetBranch);
      return res.success ? `✔ ${res.message}` : `❌ ${res.message}`;
    }
    case "remove": {
      const res = await removeDotWorktree(dotName, true);
      return res.success ? `✔ ${res.message}` : `❌ ${res.message}`;
    }
    default:
      return `Unknown worktree action: ${action}`;
  }
}

// ---------------------------------------------------------------- ReMe Memory (QwenPaw)

async function toolReMeStore(
  ctx: VaultCtx,
  a: {
    title: string;
    content: string;
    category?: string;
    tags?: string[];
    relatedTopics?: string[];
    confidence?: number;
  },
) {
  try {
    const doc = await storeReMeMemory(ctx, a);
    return JSON.stringify({
      success: true,
      message: `Memory stored permanently in ReMe vault`,
      vaultPath: doc.vaultPath,
      title: doc.title,
      wikilinks: doc.wikilinks,
    });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolReMeRecall(
  ctx: VaultCtx,
  a: { query: string; limit?: number },
) {
  try {
    const results = await recallReMeMemories(ctx, a.query, a.limit || 5);
    return JSON.stringify({
      count: results.length,
      results: results.map((r) => ({
        title: r.title,
        category: r.category,
        path: r.vaultPath,
        score: r.score,
        wikilinks: r.wikilinks,
        snippet: r.content.slice(0, 300),
      })),
    });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolReMeDream(ctx: VaultCtx) {
  try {
    const result = await runReMeDreamCycle(ctx);
    return JSON.stringify({
      success: true,
      message: `ReMe Auto-Dream consolidation cycle complete`,
      consolidatedCount: result.consolidated,
      newFiles: result.newFiles,
    });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------- Goose Automation Recipes (aaif-goose/goose)

function toolListRecipes(ctx: VaultCtx) {
  const list = listRecipes(ctx);
  return JSON.stringify({
    count: list.length,
    recipes: list.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category,
      parameters: r.parameters,
      stepCount: r.steps.length,
    })),
  });
}

async function toolRunRecipe(ctx: VaultCtx, a: { recipeId: string; parameters?: Record<string, string> }) {
  try {
    const res = await executeRecipe(ctx, a.recipeId, a.parameters || {});
    return JSON.stringify({
      success: res.status === "completed",
      recipeId: res.recipeId,
      recipeName: res.recipeName,
      status: res.status,
      durationSeconds: Math.round(res.totalDurationMs / 1000),
      stepsCompleted: res.stepResults.filter((s) => s.status === "completed").length,
      finalReport: res.finalReport,
    });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------- Agent-Reach (Panniantong/Agent-Reach)

async function toolReachWeb(_ctx: VaultCtx, a: { url: string; maxChars?: number }) {
  try {
    const res = await reachWeb(a.url, a.maxChars);
    return JSON.stringify({
      title: res.title,
      url: res.url,
      source: res.source,
      contentLength: res.length,
      markdown: res.markdown,
    });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolReachGithub(_ctx: VaultCtx, a: { repo: string }) {
  try {
    const res = await reachGithub(a.repo);
    return JSON.stringify(res);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolReachReddit(_ctx: VaultCtx, a: { target: string }) {
  try {
    const res = await reachReddit(a.target);
    return JSON.stringify(res);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolReachYouTube(_ctx: VaultCtx, a: { videoIdOrUrl: string }) {
  try {
    const res = await reachYouTube(a.videoIdOrUrl);
    return JSON.stringify(res);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolReachTweet(_ctx: VaultCtx, a: { urlOrId: string }) {
  try {
    const res = await reachTweet(a.urlOrId);
    return JSON.stringify(res);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolReachRss(_ctx: VaultCtx, a: { feedUrl: string; maxItems?: number }) {
  try {
    const res = await reachRss(a.feedUrl, a.maxItems);
    return JSON.stringify(res);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolReachDoctor(_ctx: VaultCtx) {
  try {
    const res = await runAgentReachDoctor();
    return JSON.stringify(res);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------- OpenBrowser Autonomous Web Engine (ntegrals/openbrowser)

async function toolBrowserNavigate(_ctx: VaultCtx, a: { url: string; sessionId?: string }) {
  try {
    const s = await OpenBrowserEngine.navigate(a.sessionId || "default", a.url);
    return JSON.stringify({
      title: s.title,
      url: s.currentUrl,
      status: s.status,
      elementCount: s.interactiveElements.length,
      snapshot: OpenBrowserEngine.snapshot(s.sessionId),
    });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolBrowserClick(_ctx: VaultCtx, a: { elementId: number; sessionId?: string }) {
  try {
    const s = await OpenBrowserEngine.click(a.sessionId || "default", a.elementId);
    return JSON.stringify({
      success: true,
      newUrl: s.currentUrl,
      title: s.title,
      snapshot: OpenBrowserEngine.snapshot(s.sessionId),
    });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

function toolBrowserType(_ctx: VaultCtx, a: { elementId: number; text: string; sessionId?: string }) {
  try {
    const s = OpenBrowserEngine.type(a.sessionId || "default", a.elementId, a.text);
    return JSON.stringify({
      success: true,
      elementId: a.elementId,
      typedValue: a.text,
      currentUrl: s.currentUrl,
    });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolBrowserSubmit(_ctx: VaultCtx, a: { elementId?: number; sessionId?: string }) {
  try {
    const s = await OpenBrowserEngine.submit(a.sessionId || "default", a.elementId);
    return JSON.stringify({
      success: true,
      currentUrl: s.currentUrl,
      title: s.title,
      snapshot: OpenBrowserEngine.snapshot(s.sessionId),
    });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

function toolBrowserSnapshot(_ctx: VaultCtx, a: { sessionId?: string }) {
  try {
    const s = OpenBrowserEngine.getOrCreateSession(a.sessionId || "default");
    return OpenBrowserEngine.snapshot(s.sessionId);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------- AIPex Real Browser Bridge (AIPexStudio/AIPex)

function toolAipexListTabs(_ctx: VaultCtx) {
  try {
    const tabs = aipexBridge.listTabs();
    return JSON.stringify({ count: tabs.length, tabs });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

function toolAipexSwitchTab(_ctx: VaultCtx, a: { tabId: number }) {
  try {
    const tab = aipexBridge.switchTab(a.tabId);
    return JSON.stringify({ success: true, activeTab: tab });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

function toolAipexNewTab(_ctx: VaultCtx, a: { url: string; title?: string }) {
  try {
    const tab = aipexBridge.newTab(a.url, a.title);
    return JSON.stringify({ success: true, createdTab: tab });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

function toolAipexCloseTab(_ctx: VaultCtx, a: { tabId: number }) {
  try {
    const ok = aipexBridge.closeTab(a.tabId);
    return JSON.stringify({ success: ok });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolAipexEvalScript(_ctx: VaultCtx, a: { tabId: number; code: string }) {
  try {
    const res = await aipexBridge.evalScript(a.tabId, a.code);
    return JSON.stringify(res);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

function toolAipexStatus(_ctx: VaultCtx) {
  try {
    const s = aipexBridge.getStatus();
    return JSON.stringify(s);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------- Tencent BrowserSkill Debugging Tools (Tencent/BrowserSkill)

async function toolBskOpen(_ctx: VaultCtx, a: { url: string; sessionId?: string }) {
  try {
    const res = await browserSkill.bskOpen(a.sessionId || "default", a.url);
    return JSON.stringify(res);
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

function toolBskConsole(_ctx: VaultCtx, a: { limit?: number; level?: "log" | "warn" | "error" | "info" }) {
  try {
    const logs = browserSkill.getConsoleLogs(a.limit || 20, a.level);
    return JSON.stringify({ count: logs.length, logs });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

function toolBskNetwork(_ctx: VaultCtx, a: { limit?: number; search?: string }) {
  try {
    const requests = browserSkill.getNetworkLogs(a.limit || 20, { search: a.search });
    return JSON.stringify({ count: requests.length, requests });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolBskScreenshot(ctx: VaultCtx, a: { sessionId?: string; targetPath?: string }) {
  try {
    const res = await browserSkill.bskScreenshot(ctx, a.sessionId || "default", a.targetPath);
    return JSON.stringify({ success: true, vaultPath: res.vaultPath, charCount: res.charCount, title: res.title });
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

async function toolBskCli(ctx: VaultCtx, a: { command: string; sessionId?: string }) {
  try {
    const args = a.command.trim().split(/\s+/);
    if (args[0] === "bsk") args.shift();
    const output = await browserSkill.executeCli(ctx, args, a.sessionId || "default");
    return output;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------- digup (hybrid code/doc search)

async function toolDigUpSearch(ctx: VaultCtx, a: { query: string; limit?: number; fileTypes?: string[] }) {
  try {
    const hits = await hybridDigUpSearch(ctx, a.query, { limit: a.limit, fileTypes: a.fileTypes });
    if (hits.length === 0) return `DigUp found no semantic or exact matches for: "${a.query}"`;
    return hits
      .map(
        (h, i) =>
          `[#${i + 1}] ${h.filePath} (${h.matchType.toUpperCase()} | score: ${h.score} | lang: ${h.language})\n${h.snippet.slice(0, 300)}...`,
      )
      .join("\n\n---\n\n");
  } catch (err) {
    return `DigUp search error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toolDigUpIndex(ctx: VaultCtx, a: { dirPath?: string }) {
  try {
    const res = await indexVaultForDigUp(ctx, a.dirPath || "/");
    return `DigUp indexing complete: ${res.indexedFiles} files, ${res.totalChunks} code/doc chunks indexed into vector + FTS5 store.`;
  } catch (err) {
    return `DigUp indexing error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toolDigUpStats(ctx: VaultCtx) {
  try {
    const stats = await getDigUpStats(ctx);
    return `DigUp Code Engine Stats:\n- Files Indexed: ${stats.totalFiles}\n- Total Chunks: ${stats.totalChunks}\n- Total Tokens: ${stats.totalTokens}\n- Last Updated: ${new Date(stats.lastIndexedAt || Date.now()).toISOString()}`;
  } catch (err) {
    return `DigUp stats error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------- swarm (ruflo multi-agent orchestration)

function toolSwarmSpawn(_ctx: VaultCtx, a: { goal: string; topology?: "mesh" | "hierarchical" | "star" | "consensus" }) {
  try {
    const session = swarmEngine.spawn(a.goal, a.topology || "hierarchical");
    return `Swarm spawned [${session.topology.toUpperCase()}] for goal: "${session.goal}". Agents active: ${session.agents.map((ag) => `${ag.name} (${ag.role})`).join(", ")}. Tasks scheduled: ${session.tasks.length}.`;
  } catch (err) {
    return `Swarm spawn error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toolSwarmStep(ctx: VaultCtx) {
  try {
    const res = await swarmEngine.step(ctx);
    return `Swarm Step Result: ${res.stepMessage} (Session status: ${res.session.status.toUpperCase()})`;
  } catch (err) {
    return `Swarm step error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolSwarmConsensus(_ctx: VaultCtx, a: { taskId?: string; proposal: string; threshold?: number }) {
  try {
    const ballot = swarmEngine.conductConsensusVote(a.taskId || "ad-hoc", a.proposal, a.threshold);
    const summary = ballot.votes.map((v) => `  - ${v.agentRole}: ${v.vote.toUpperCase()} (${(v.confidence * 100).toFixed(0)}%) - ${v.rationale}`).join("\n");
    return `Consensus Ballot #${ballot.id}:\nOutcome: ${ballot.passed ? "PASSED ✅" : "REJECTED ❌"} (Score: ${(ballot.weightedScore * 100).toFixed(0)}%, Threshold: ${(ballot.threshold * 100).toFixed(0)}%)\nVotes:\n${summary}`;
  } catch (err) {
    return `Swarm consensus error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolSwarmBlackboardPost(_ctx: VaultCtx, a: { topic: string; content: string; tags?: string[] }) {
  try {
    const entry = swarmEngine.postBlackboard("agent-coord", a.topic, a.content, a.tags || []);
    return `Posted to swarm blackboard under [${entry.topic}]: "${entry.content.slice(0, 100)}"`;
  } catch (err) {
    return `Swarm blackboard post error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolSwarmBlackboardRead(_ctx: VaultCtx, a: { topic?: string; limit?: number }) {
  try {
    const entries = swarmEngine.getBlackboard(a.topic ? { topic: a.topic } : undefined).slice(0, a.limit || 10);
    if (entries.length === 0) return `Swarm blackboard is currently empty${a.topic ? ` for topic "${a.topic}"` : ""}.`;
    return entries
      .map((e) => `[${new Date(e.timestamp).toLocaleTimeString()}] [${e.topic.toUpperCase()}] <${e.authorRole}>: ${e.content}`)
      .join("\n");
  } catch (err) {
    return `Swarm blackboard read error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolSwarmStatus(_ctx: VaultCtx) {
  try {
    const state = swarmEngine.getState();
    const activeTasks = state.tasks.filter((t) => t.status === "in_progress" || t.status === "pending").length;
    const completedTasks = state.tasks.filter((t) => t.status === "completed").length;
    return `Swarm Status: [${state.status.toUpperCase()}]
Topology: ${state.topology.toUpperCase()}
Goal: ${state.goal}
Active Agents: ${state.agents.map((a) => `${a.name} (${a.status})`).join(", ")}
Tasks: ${completedTasks}/${state.tasks.length} completed (${activeTasks} remaining)
Blackboard Entries: ${state.blackboard.length}
Consensus Ballots: ${state.ballots.length}`;
  } catch (err) {
    return `Swarm status error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------- orca (git worktree fleet & merge engine)

async function toolOrcaFleetList(_ctx: VaultCtx, a: { baseBranch?: string }) {
  try {
    const fleet = await getOrcaFleet(a.baseBranch || "main");
    if (fleet.length === 0) return "Orca Fleet: No active isolated agent worktrees currently spawned.";
    return fleet
      .map(
        (w) =>
          `• [${w.name}] branch: ${w.branch} | mergeability: ${w.mergeability} | head: ${w.headCommit} | ahead: ${w.commitsAhead}, behind: ${w.commitsBehind} | ${w.isClean ? "clean" : `dirty (${w.uncommittedFiles.length} uncommitted)`}` +
          (w.conflictingFiles && w.conflictingFiles.length > 0 ? `\n  ⚠️ Conflicts: ${w.conflictingFiles.join(", ")}` : ""),
      )
      .join("\n");
  } catch (err) {
    return `Orca fleet list error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toolOrcaCreateWorktree(_ctx: VaultCtx, a: { name: string; baseBranch?: string }) {
  try {
    const res = await createOrcaWorktree(a.name, a.baseBranch || "main");
    if (!res.success) return `Orca worktree creation failed: ${res.message}`;
    return `Created isolated agent worktree [${res.worktree?.name}] on branch [${res.worktree?.branch}] at ${res.worktree?.worktreePath}`;
  } catch (err) {
    return `Orca create worktree error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toolOrcaWorktreeDiff(_ctx: VaultCtx, a: { name: string; baseBranch?: string }) {
  try {
    const res = await getOrcaWorktreeDiff(a.name, a.baseBranch || "main");
    if (res.files.length === 0) return `Orca Diff: No changes between agent worktree "${a.name}" and "${a.baseBranch || "main"}".`;
    const fileList = res.files.map((f) => `  - [${f.status.toUpperCase()}] ${f.filePath} (+${f.insertions}/-${f.deletions})`).join("\n");
    return `Orca 3-Way Diff for "${a.name}":\nSummary: ${res.summary.filesChanged} files changed (+${res.summary.insertions}/-${res.summary.deletions})\nFiles:\n${fileList}`;
  } catch (err) {
    return `Orca diff error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toolOrcaDryRunMerge(_ctx: VaultCtx, a: { name: string; baseBranch?: string }) {
  try {
    const res = await dryRunOrcaMerge(a.name, a.baseBranch || "main");
    if (res.canMergeCleanly) {
      return `Orca Dry-Run: CLEAN MERGE POSSIBLE ✅\nTarget: ${res.targetBranch} -> ${res.baseBranch}\nMerge-base: ${res.mergeBaseCommit}\n${res.recommendedResolution}`;
    }
    return `Orca Dry-Run: CONFLICT DETECTED ⚠️ (${res.conflictCount} conflicting files)\nFiles:\n${res.conflictingFiles.map((f) => `  - ${f}`).join("\n")}\nRecommendation: ${res.recommendedResolution}`;
  } catch (err) {
    return `Orca dry-run error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toolOrcaMergeWorktree(_ctx: VaultCtx, a: { name: string; baseBranch?: string; squash?: boolean; prune?: boolean }) {
  try {
    const res = await mergeAndPruneOrcaWorktree(a.name, a.baseBranch || "main", {
      squash: a.squash,
      prune: a.prune,
    });
    return res.message;
  } catch (err) {
    return `Orca merge error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------- paperclip (virtual AI company & governance)

function toolPaperclipOrgChart(_ctx: VaultCtx) {
  try {
    const company = paperclipEngine.getState();
    const memberLines = company.members.map((m) => {
      const reports = m.reportsTo ? ` (reports to ${company.members.find((r) => r.id === m.reportsTo)?.name || m.reportsTo})` : "";
      return `• ${m.avatar} ${m.name} — ${m.title} [${m.department} | ${m.tier}]${reports} · Status: ${m.status.toUpperCase()}`;
    });
    return `${company.companyName} — Virtual AI Org Chart:\n${memberLines.join("\n")}`;
  } catch (err) {
    return `Paperclip org error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolPaperclipBudgetStatus(_ctx: VaultCtx, a: { memberId?: string }) {
  try {
    const company = paperclipEngine.getState();
    if (a.memberId) {
      const b = company.budgets[a.memberId];
      if (!b) return `No budget profile for ${a.memberId}`;
      const m = company.members.find((mem) => mem.id === a.memberId);
      return `Budget for ${m?.name || a.memberId}:
• Daily Spend: $${b.spentTodayUsd.toFixed(2)} / $${b.dailyCapUsd.toFixed(2)} (${b.tokensUsedToday.toLocaleString()} tokens)
• Monthly Spend: $${b.spentMonthUsd.toFixed(2)} / $${b.monthlyCapUsd.toFixed(2)}
• Hard-Stop Enabled: ${b.hardStopEnabled ? "YES 🚨" : "NO"}
• Status: ${m?.isHardStopped ? "HARD-STOPPED 🛑" : "ACTIVE 🟢"}`;
    }

    const rows = company.members.map((m) => {
      const b = company.budgets[m.id];
      return `• ${m.name}: $${b?.spentTodayUsd.toFixed(2) || "0.00"} / $${b?.dailyCapUsd.toFixed(2) || "0.00"} (Month: $${b?.spentMonthUsd.toFixed(2) || "0.00"}) ${m.isHardStopped ? "🛑 HARD-STOPPED" : "🟢 ACTIVE"}`;
    });
    return `Company Spend Summary (Month: $${company.totalSpendMonthUsd.toFixed(2)} / $${company.monthlyCompanyCapUsd.toFixed(2)}):\n${rows.join("\n")}`;
  } catch (err) {
    return `Paperclip budget error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolPaperclipRunStandup(_ctx: VaultCtx) {
  try {
    const session = paperclipEngine.runStandup();
    const details = session.entries.map((e) => `• [${e.department}] ${e.memberName}:\n  Done: ${e.yesterdayAccomplished.join("; ")}\n  Next: ${e.todayPlanned.join("; ")}${e.blockers.length > 0 ? `\n  Blockers: ${e.blockers.join("; ")}` : ""}`).join("\n\n");
    return `🏁 Autonomous Standup (${session.dateStr}):\n${session.executiveBriefing}\n\n${details}`;
  } catch (err) {
    return `Paperclip standup error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolPaperclipGovernanceQueue(_ctx: VaultCtx) {
  try {
    const queue = paperclipEngine.getState().pendingApprovals.filter((a) => a.status === "pending");
    if (queue.length === 0) return "Governance Queue: No pending high-risk approval requests.";
    return `Pending Governance Approvals (${queue.length}):\n` + queue.map((a) => `• [#${a.id}] ${a.riskLevel.toUpperCase()} RISK: ${a.requesterName} requests "${a.actionType}"\n  Reason: ${a.reason}\n  Submitted: ${new Date(a.createdAt).toLocaleTimeString()}`).join("\n\n");
  } catch (err) {
    return `Paperclip governance queue error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolPaperclipApproveAction(_ctx: VaultCtx, a: { id: string; decision: "approved" | "rejected"; reason?: string }) {
  try {
    const res = paperclipEngine.resolveApproval(a.id, a.decision, a.reason ? `Supervisor (${a.reason})` : "Supervisor");
    return res.message;
  } catch (err) {
    return `Paperclip approve error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------- ifixai (agent auditing & misalignment diagnostics)

function toolIFixAiAuditDot(_ctx: VaultCtx, a: { dotName: string; promptContent: string }) {
  try {
    const res = ifixaiEngine.auditPromptOrDot(a.dotName, a.promptContent);
    const findingsStr = res.findings.length > 0
      ? "\nFindings:\n" + res.findings.map((f) => `• [${f.severity.toUpperCase()}] ${f.title}: ${f.description}\n  Fix: ${f.remediationAdvice}`).join("\n")
      : "\nFindings: None. Full compliance.";
    return `iFixAi Audit for [${a.dotName}]: Grade ${res.scorecard.letterGrade} (${res.scorecard.overallScore}%)${findingsStr}`;
  } catch (err) {
    return `iFixAi audit error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function toolIFixAiAuditVault(ctx: VaultCtx, a: { targetDir?: string }) {
  try {
    const res = await ifixaiEngine.scanVault(ctx, a.targetDir || "/");
    const findingsStr = res.findings.length > 0
      ? "\nSecurity Vulnerabilities:\n" + res.findings.map((f) => `• [${f.severity.toUpperCase()}] ${f.target}: ${f.title} (${f.evidenceSnippet})`).join("\n")
      : "\nZero vulnerabilities detected across scanned files.";
    return `iFixAi Vault Security Scan: Scanned ${res.scannedFiles} files. Scorecard Grade: ${res.scorecard.letterGrade} (${res.scorecard.overallScore}%)${findingsStr}`;
  } catch (err) {
    return `iFixAi vault audit error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolIFixAiGetScorecard(_ctx: VaultCtx) {
  try {
    const sc = ifixaiEngine.getScorecard();
    const categories = sc.categoryScores.map((c) => `  - ${c.name}: ${c.score}% (${c.passed ? "PASSED" : "FAILED"}, ${c.findingsCount} findings)`).join("\n");
    return `iFixAi Security Scorecard:
• Overall Grade: ${sc.letterGrade} (${sc.overallScore}%)
• Timestamp: ${new Date(sc.timestamp).toLocaleString()}
• Categories:
${categories}
• Active Findings: ${sc.findings.length}
• Remediation Recommendations:
${sc.remediationPatches.map((p) => `  • ${p}`).join("\n")}`;
  } catch (err) {
    return `iFixAi scorecard error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------- ecc (surgical prompt contracts & verification gates)

function toolEccListRules(_ctx: VaultCtx, a: { category?: string }) {
  try {
    const state = eccEngine.getState();
    let rules = state.learnedRules;
    if (a.category) {
      rules = rules.filter((r) => r.category.toLowerCase() === a.category!.toLowerCase());
    }
    if (rules.length === 0) return "No active ECC rules matching criteria.";
    return `Active ECC Rules (${rules.length}):\n` + rules.map((r, i) => `${i + 1}. [${r.category.toUpperCase()}] ${r.title}\n   ${r.ruleText}`).join("\n\n");
  } catch (err) {
    return `ECC list error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolEccLearnRule(ctx: VaultCtx, a: { title: string; ruleText: string; category?: "coding" | "safety" | "formatting" | "workflow" | "user_preference" }) {
  try {
    const rule = eccEngine.learnRule(a.title, a.ruleText, a.category || "coding", "user_correction", ctx);
    return `Learned new rule #${rule.id} [${rule.category.toUpperCase()}]: "${rule.title}" - Saved to permanent vault rulebook.`;
  } catch (err) {
    return `ECC learn error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolEccVerifyGate(_ctx: VaultCtx, a: { hasTypeScriptPassed: boolean; hasBuildPassed: boolean; commentsPreserved: boolean; unrelatedDiffsAvoided: boolean }) {
  try {
    const res = eccEngine.runVerificationGate(a);
    const checkLines = res.checks.map((c) => `• [${c.passed ? "PASS" : "FAIL"}] ${c.name}: ${c.description} (${c.evidence})`).join("\n");
    return `Quality Verification Gate: ${res.overallPassed ? "PASSED (100%) ✅" : "FAILED ❌"}\n${checkLines}`;
  } catch (err) {
    return `ECC verification error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolEccGetContract(_ctx: VaultCtx, a: { phase?: "plan" | "implement" | "verify" }) {
  try {
    const state = eccEngine.getState();
    const phase = a.phase || "implement";
    const contract = state.contracts[phase];
    if (!contract) return `No contract found for phase "${phase}".`;
    return `${contract.title}:\n` + contract.systemRules.map((r, i) => `${i + 1}. ${r}`).join("\n");
  } catch (err) {
    return `ECC contract error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------- hermes (dynamic tool synthesis & reflection)

async function toolHermesSynthesizeTool(
  ctx: VaultCtx,
  a: {
    name: string;
    description: string;
    code: string;
    parameters?: Array<{ name: string; type: "string" | "number" | "boolean"; description: string; required?: boolean }>;
  },
) {
  try {
    const res = await hermesEngine.synthesizeTool(
      {
        name: a.name,
        description: a.description,
        code: a.code,
        parameters: (a.parameters || []).map((p) => ({
          name: p.name,
          type: p.type,
          description: p.description,
          required: p.required ?? true,
        })),
      },
      ctx,
    );
    if (!res.success) return `Hermes tool synthesis failed: ${res.error}`;
    return `Synthesized new dynamic tool [${res.tool?.name}]. Test output: ${res.testOutput}. Tool registered and saved to vault.`;
  } catch (err) {
    return `Hermes synthesize error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolHermesListSynthesizedTools(_ctx: VaultCtx) {
  try {
    const tools = hermesEngine.listSynthesizedTools();
    if (tools.length === 0) return "No dynamic tools synthesized yet.";
    return `Synthesized Dynamic Tools (${tools.length}):\n` + tools.map((t) => `• [${t.name}] ${t.description} (params: ${t.parameters.map((p) => p.name).join(", ") || "none"}) - Executed ${t.executionCount} time(s)`).join("\n");
  } catch (err) {
    return `Hermes list tools error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolHermesReflectTurn(_ctx: VaultCtx, a: { taskGoal: string; steps?: Array<{ tool: string; resultSnippet: string; success: boolean }> }) {
  try {
    const res = hermesEngine.runReflection(a.taskGoal, a.steps || []);
    return `Hermes Reflection:
• Alignment Score: ${res.alignmentScore}%
• Efficiency Score: ${res.efficiencyScore}%
• Summary: ${res.reflectionSummary}
• Strengths: ${res.strengths.join("; ")}
• Recommended Lesson: ${res.recommendedRules.join("; ")}`;
  } catch (err) {
    return `Hermes reflection error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function toolHermesExportTrajectory(ctx: VaultCtx, a: { sessionId?: string }) {
  try {
    const res = hermesEngine.exportTrajectory(ctx, a.sessionId);
    return `Exported trajectory (${res.stepCount} steps) to encrypted vault: ${res.filePath}`;
  } catch (err) {
    return `Hermes trajectory export error: ${err instanceof Error ? err.message : String(err)}`;
  }
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

  reg(
    "read_pdf",
    "Extract and read the text of a PDF document stored in the vault. Returns page count and full readable text with optional page limits.",
    P(
      "read_pdf",
      "Read a PDF file",
      { path: { type: "string", description: "Vault path to .pdf file" } },
      { maxPages: { type: "number", description: "Max pages to extract (default: all)" } },
    ),
    toolReadPdf,
    false,
    z.object({ path: z.string().min(1), maxPages: z.number().optional() }),
  );

  reg(
    "inspect_zip",
    "Inspect the contents of a ZIP archive in the user's vault without extracting it. Returns the file tree with paths, uncompressed sizes, and dates.",
    P("inspect_zip", "Inspect ZIP archive", {
      path: { type: "string", description: "Vault path to .zip archive" },
    }),
    toolInspectZip,
    false,
    z.object({ path: z.string().min(1) }),
  );

  reg(
    "read_zip_entry",
    "Read the text content of a specific file inside a ZIP archive in the vault without unpacking the entire archive.",
    P(
      "read_zip_entry",
      "Read file inside ZIP",
      {
        zipPath: { type: "string", description: "Vault path to .zip archive" },
        entryPath: {
          type: "string",
          description: "Path of file inside archive, e.g. README.md or src/index.ts",
        },
      },
      { maxChars: { type: "number", description: "Max characters to read" } },
    ),
    toolReadZipEntry,
    false,
    z.object({
      zipPath: z.string().min(1),
      entryPath: z.string().min(1),
      maxChars: z.number().optional(),
    }),
  );

  reg(
    "extract_zip",
    "Unpack and extract all files from a ZIP archive in the vault into an encrypted destination directory in the vault.",
    P(
      "extract_zip",
      "Extract ZIP archive into vault",
      {
        zipPath: { type: "string", description: "Vault path to .zip archive" },
        destinationDir: {
          type: "string",
          description: "Target directory in vault, e.g. /extracted/my-project",
        },
      },
    ),
    toolExtractZip,
    true,
    z.object({ zipPath: z.string().min(1), destinationDir: z.string().min(1) }),
  );

  reg(
    "analyze_data_file",
    "Analyze a structured tabular dataset (CSV, TSV, or JSON) in the vault. Returns row count, column types, statistics (min, max, average, sum for numbers), distinct counts, and sample records.",
    P("analyze_data_file", "Analyze data file", {
      path: { type: "string", description: "Vault path to CSV, TSV, or JSON file" },
    }),
    toolAnalyzeDataFile,
    false,
    z.object({ path: z.string().min(1) }),
  );

  reg(
    "run_js_code",
    "Execute a JavaScript code snippet in a sandboxed environment for algorithms, statistical analysis, data processing, string manipulation, or complex logic. Always requires human approval.",
    P("run_js_code", "Run sandboxed JavaScript", {
      code: { type: "string", description: "JavaScript code snippet to execute" },
    }),
    toolRunJsCode,
    true, // Destructive / Security boundary: Requires explicit human approval
    z.object({ code: z.string().min(1) }),
  );

  // ---------------------------------------------------------------- RAG (Vector Search)

  reg(
    "search_chunks",
    "Search the vector RAG index for relevant file chunks using cosine similarity. Returns matching content with scores.",
    P(
      "search_chunks",
      "Search vector RAG",
      { query: { type: "string", description: "Search query" } },
      {
        k: { type: "number", description: "Max results (default 5)" },
        filePaths: { type: "array", items: { type: "string" }, description: "Optional file paths to restrict search" },
      },
    ),
    toolSearchChunks,
    false,
    z.object({ query: z.string().min(1), k: z.number().optional(), filePaths: z.array(z.string()).optional() }),
  );

  reg(
    "reindex_vault",
    "Re-index all files in the vault for vector RAG. Reads all file content, chunks it, generates embeddings, and stores in file_chunks table.",
    P("reindex_vault", "Reindex vault for RAG", {}),
    toolReindexVault,
    true,
    z.object({}),
  );

  reg(
    "rag_stats",
    "Get statistics about the vector RAG index: file count, chunk count, embedding models used.",
    P("rag_stats", "RAG statistics", {}),
    toolRagStats,
    false,
    z.object({}),
  );

  // ---------------------------------------------------------------- Memory Consolidation (STM → LTM)

  reg(
    "store_stm",
    "Store a fact in short-term memory (STM). Facts with repeated access will be promoted to permanent long-term memory (LTM) during consolidation.",
    P(
      "store_stm",
      "Store in STM",
      { key: { type: "string", description: "Unique key for this fact" }, fact: { type: "string", description: "The fact to remember" } },
      {
        context: { type: "string", description: "Context where this fact was learned" },
        source: { type: "string", description: "Source: chat, web, file, etc." },
        confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence level (0-1)" },
      },
    ),
    toolStoreSTM,
    false,
    z.object({ key: z.string().min(1), fact: z.string().min(1), context: z.string().optional(), source: z.string().optional(), confidence: z.number().min(0).max(1).optional() }),
  );

  reg(
    "recall_stm",
    "Recall a fact from short-term memory by its key. Increments access count and resets decay.",
    P("recall_stm", "Recall from STM", { key: { type: "string", description: "STM key to recall" } }),
    toolRecallSTM,
    false,
    z.object({ key: z.string().min(1) }),
  );

  reg(
    "list_stm",
    "List all active short-term memory entries with their decay scores and access counts.",
    P("list_stm", "List STM entries", {}),
    toolListSTM,
    false,
    z.object({}),
  );

  reg(
    "run_consolidation",
    "Run the memory consolidation job: cluster similar STM entries, synthesize them, promote to LTM, and clean up old unaccessed entries.",
    P("run_consolidation", "Run memory consolidation", {}),
    toolRunConsolidation,
    false,
    z.object({}),
  );

  reg(
    "consolidation_stats",
    "Get memory consolidation statistics: STM/LTM counts, promotion status, average decay.",
    P("consolidation_stats", "Consolidation statistics", {}),
    toolConsolidationStats,
    false,
    z.object({}),
  );

  // ---------------------------------------------------------------- Tree-of-Thought

  reg(
    "run_tot",
    "Run Tree-of-Thought derivation: explores multiple reasoning paradigms (Force Balance, Energy, Symmetry) to synthesize an elegant solution.",
    P("run_tot", "Run Tree-of-Thought", { problem: { type: "string", description: "Physics/math problem to solve" } }, { knowns: { type: "object", description: "Known variables" }, unknowns: { type: "array", items: { type: "string" }, description: "Variables to solve for" } }),
    toolRunTot,
    false,
    z.object({ problem: z.string().min(1), knowns: z.record(z.string(), z.string()).optional(), unknowns: z.array(z.string()).optional() }),
  );

  // ---------------------------------------------------------------- Physics Arena

  reg(
    "list_physics_problems",
    "List available JEE physics problems with their parameters (bead_on_wire, double_pendulum, gyroscope, central_force).",
    P("list_physics_problems", "List physics problems", {}),
    toolListPhysicsProblems,
    false,
    z.object({}),
  );

  reg(
    "render_physics_problem",
    "Get configuration for a physics problem to render in the Artifact Drawer. Returns parameters and description.",
    P("render_physics_problem", "Get physics problem config", { type: { type: "string", description: "Problem type" } }, { params: { type: "object", description: "Optional parameter overrides" } }),
    toolRenderPhysicsProblem,
    false,
    z.object({ type: z.string().min(1), params: z.record(z.string(), z.number()).optional() }),
  );

  // ---------------------------------------------------------------- Semantic Router

  reg(
    "classify_intent",
    "Classify user intent from text to determine optimal model tier (fast/balanced/reasoning).",
    P("classify_intent", "Classify intent", { text: { type: "string", description: "User input text" } }),
    toolClassifyIntent,
    false,
    z.object({ text: z.string().min(1) }),
  );

  reg(
    "route_intent",
    "Route an intent to the best provider/model using the semantic router. Returns provider ID, model, tier, and reasoning.",
    P("route_intent", "Route intent to provider", { text: { type: "string", description: "User input text" } }, { providerId: { type: "number" }, model: { type: "string" }, tier: { type: "string", enum: ["fast", "balanced", "reasoning"] } }),
    toolRouteIntent,
    false,
    z.object({ text: z.string().min(1), providerId: z.number().optional(), model: z.string().optional(), tier: z.enum(["fast", "balanced", "reasoning"]).optional() }),
  );

  // ---------------------------------------------------------------- exams

  reg(
    "list_exam_topics",
    "List all exam preparation subjects, exam target dates, and all topics with current preparation percentages (0-100%).",
    P("list_exam_topics", "List exam topics and progress", {}),
    toolListExamTopics,
  );

  reg(
    "log_study_session",
    "Log an exam study session into exam study logs with duration in minutes, optional topic/subject name, and optional notes.",
    P(
      "log_study_session",
      "Log exam study session",
      { durationMin: { type: "number", description: "Minutes studied" } },
      {
        topicName: { type: "string", description: "Exam topic name" },
        subjectName: { type: "string", description: "Exam subject name" },
        notes: { type: "string", description: "Notes about what was revised" },
      },
    ),
    toolLogStudySession,
    false,
    z.object({
      durationMin: z.number().positive(),
      topicName: z.string().optional(),
      subjectName: z.string().optional(),
      notes: z.string().optional(),
    }),
  );

  reg(
    "update_event",
    "Update an existing calendar event's title, time, notes, or color.",
    P(
      "update_event",
      "Update calendar event",
      { id: { type: "number", description: "Event id" } },
      {
        title: { type: "string" },
        startAt: { type: "string", description: "ISO date or epoch ms" },
        endAt: { type: "string", description: "ISO date or epoch ms" },
        allDay: { type: "boolean" },
        color: { type: "string" },
        notes: { type: "string" },
      },
    ),
    toolUpdateEvent,
  );

  reg(
    "delete_event",
    "Delete a calendar event from the user's calendar.",
    P("delete_event", "Delete calendar event", {
      id: { type: "number", description: "Event ID to delete" },
    }),
    toolDeleteEvent,
    true,
    z.object({ id: z.number() }),
  );

  // Dynamic autonomous skills system
  try {
    loadAndRegisterCustomSkills(getDb());
  } catch {}

  reg(
    "install_skill",
    "Dynamically create and install a new tool/plugin into your AI system. It immediately registers and becomes available for you to execute in next steps. Supply name (snake_case), description of when to call it, JSON schema parameters, and async JavaScript execution code body (can use args, ctx, fetch).",
    P(
      "install_skill",
      "Install dynamic AI skill/plugin",
      {
        name: { type: "string", description: "Skill name in snake_case, e.g. currency_converter" },
        description: { type: "string", description: "What the skill does and when the model should call it" },
        code: { type: "string", description: "JavaScript function body, e.g. const res = await fetch(...); return res.text();" },
      },
      {
        parameters: { type: "object", description: "OpenAI JSON schema for arguments" },
      },
    ),
    (c, a) => toolInstallSkill(a, c),
    false,
    z.object({
      name: z.string(),
      description: z.string(),
      code: z.string(),
      parameters: z.any().optional(),
    }),
  );

  reg(
    "list_skills",
    "List all dynamically installed custom AI skills and plugins.",
    P("list_skills", "List custom skills", {}),
    (c, a) => toolListSkills(a, c),
  );

  reg(
    "remove_skill",
    "Uninstall and delete a dynamic AI skill by its name.",
    P("remove_skill", "Remove custom skill", {
      name: { type: "string", description: "Name of the skill to remove" },
    }),
    (c, a) => toolRemoveSkill(a, c),
    false,
    z.object({ name: z.string() }),
  );

  // ---------------------------------------------------------------- Virtual Company / Swarm tools (Paperclip & Orca)

  reg(
    "delegate_to_dot",
    "Assign a background subtask to another specialist coworker/Dot in your company (e.g. 'atlas' for coding, 'nova' for deep research, 'cypher' for security verification). The coworker executes the task autonomously and records the result.",
    P(
      "delegate_to_dot",
      "Delegate subtask to company coworker Dot",
      {
        targetDot: { type: "string", description: "Name or role of coworker Dot (e.g. 'atlas', 'nova', 'cypher')" },
        taskPrompt: { type: "string", description: "Clear instructions of what the coworker should accomplish" },
      },
      {
        intervalSeconds: { type: "number", description: "Optional repeat interval in seconds. Omit or null for one-time run." },
      },
    ),
    (c, a) => toolDelegateToDot(c, a),
    false,
    z.object({
      targetDot: z.string(),
      taskPrompt: z.string(),
      intervalSeconds: z.number().int().min(60).max(31536000).nullable().optional(),
    }),
  );

  reg(
    "manage_worktree",
    "Manage isolated git worktrees for parallel coding without branch conflicts. Actions: 'create' (sets up worktree and branch), 'status' (checks uncommitted changes), 'merge' (merges dot branch to main), 'remove' (cleans up worktree).",
    P(
      "manage_worktree",
      "Manage Dot git worktree",
      {
        action: { type: "string", description: "Action to perform: 'create' | 'status' | 'merge' | 'remove'" },
        dotName: { type: "string", description: "Name of the coworker Dot" },
      },
      {
        targetBranch: { type: "string", description: "Target branch for merge (default: 'main')" },
      },
    ),
    (c, a) => toolManageWorktree(c, a),
    false,
    z.object({
      action: z.enum(["create", "status", "merge", "remove"]),
      dotName: z.string(),
      targetBranch: z.string().optional(),
    }),
  );

  // ---------------------------------------------------------------- Hermes Autonomous Skill Synthesis

  reg(
    "synthesize_skill",
    "Permanently learn and synthesize a new reusable skill from a task solution. Generates a structured SKILL.md documentation in the user vault at /skills/<name>/SKILL.md and activates a live executable tool in memory for all Dots and chats to use.",
    P(
      "synthesize_skill",
      "Synthesize reusable AI skill",
      {
        name: { type: "string", description: "Skill name in snake_case, e.g. 'extract_tar_gz'" },
        description: { type: "string", description: "What the skill accomplishes and when to call it" },
        code: { type: "string", description: "JavaScript function body, e.g. const res = await fetch(...); return res.text();" },
      },
      {
        parameters: { type: "object", description: "JSON schema object for parameters" },
        exampleUsage: { type: "string", description: "Usage instructions or example" },
        authorDot: { type: "string", description: "Name of the Dot synthesizing this skill" },
      },
    ),
    async (c, a: never) => {
      const res = await synthesizeSkill(c, a);
      return res.message;
    },
    false,
    z.object({
      name: z.string(),
      description: z.string(),
      code: z.string(),
      parameters: z.any().optional(),
      exampleUsage: z.string().optional(),
      authorDot: z.string().optional(),
    }),
  );

  // ---------------------------------------------------------------- ReMe Three-Layer File-as-Memory (QwenPaw)

  reg(
    "reme_store",
    "Store a durable human-readable memory file in the vault (/memories/<category>/<slug>.md) with YAML frontmatter and [[wikilinks]]. Use this when the user asks you to permanently remember important concepts, user preferences, project context, or architectural decisions.",
    P(
      "reme_store",
      "Store permanent ReMe Markdown memory doc",
      {
        title: { type: "string", description: "Clear, concise title for this memory (used as slug and heading)" },
        content: { type: "string", description: "Detailed memory body text. Can contain [[wikilinks]] to other memories or concepts." },
      },
      {
        category: { type: "string", description: "Category folder, e.g. 'preferences', 'projects', 'rules', 'facts' (default: 'general')" },
        tags: { type: "array", items: { type: "string" }, description: "Search tags for discovery" },
        relatedTopics: { type: "array", items: { type: "string" }, description: "Related topics to cross-link via [[wikilinks]]" },
        confidence: { type: "number", description: "Confidence score between 0.0 and 1.0 (default 1.0)" },
      },
    ),
    (c, a) => toolReMeStore(c, a),
    false,
    z.object({
      title: z.string(),
      content: z.string(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      relatedTopics: z.array(z.string()).optional(),
      confidence: z.number().optional(),
    }),
  );

  reg(
    "reme_recall",
    "Recall relevant memories from the vault using Hybrid RRF (BM25 keyword search + semantic embeddings + [[wikilink]] graph expansion). Returns high-confidence structured knowledge.",
    P(
      "reme_recall",
      "Hybrid RRF memory retrieval",
      {
        query: { type: "string", description: "Search query or natural language question" },
      },
      {
        limit: { type: "number", description: "Max results to return (default 5)" },
      },
    ),
    (c, a) => toolReMeRecall(c, a),
    false,
    z.object({
      query: z.string(),
      limit: z.number().optional(),
    }),
  );

  reg(
    "reme_dream",
    "Trigger the ReMe Auto-Dream Consolidation Cycle. Analyzes recently accessed short-term memories and consolidates them into permanent Markdown files in /memories/ with wikilinks.",
    P("reme_dream", "Consolidate STM to durable ReMe Markdown files", {}),
    (c) => toolReMeDream(c),
    false,
    z.object({}),
  );

  // ---------------------------------------------------------------- Goose Automation Recipes (aaif-goose/goose)

  reg(
    "list_recipes",
    "Discover all available Goose automation recipes in Phryvos-K9 (e.g. 'code-review', 'security-audit', 'test-and-fix', 'docs-sync', 'backup-verify').",
    P("list_recipes", "List automation recipes", {}),
    (c) => toolListRecipes(c),
    false,
    z.object({}),
  );

  reg(
    "run_recipe",
    "Execute a multi-step Goose automation recipe sequentially. Each step runs autonomously with specific tool constraints and emits an overall execution report.",
    P(
      "run_recipe",
      "Run automation recipe",
      {
        recipeId: { type: "string", description: "Recipe ID (e.g. 'code-review', 'security-audit', 'test-and-fix', 'docs-sync')" },
      },
      {
        parameters: { type: "object", description: "Optional key-value parameters to substitute in recipe step prompts" },
      },
    ),
    (c, a) => toolRunRecipe(c, a),
    false,
    z.object({
      recipeId: z.string(),
      parameters: z.record(z.string(), z.string()).optional(),
    }),
  );

  // ---------------------------------------------------------------- Agent-Reach Multi-Channel Web Tools (Panniantong/Agent-Reach)

  reg(
    "reach_web",
    "Fetch clean, structured Markdown from any public website URL without ads, popups, or paywall banners (powered by Jina Reader r.jina.ai).",
    P(
      "reach_web",
      "Fetch clean web markdown",
      { url: { type: "string", description: "Target website URL" } },
      { maxChars: { type: "number", description: "Max characters to retrieve (default: 20000)" } },
    ),
    (c, a) => toolReachWeb(c, a),
    false,
    z.object({
      url: z.string(),
      maxChars: z.number().optional(),
    }),
  );

  reg(
    "reach_github",
    "Inspect a public GitHub repository. Retrieves stars, forks, README.md, file tree, and open issues without requiring GitHub API tokens.",
    P(
      "reach_github",
      "Inspect GitHub repository",
      { repo: { type: "string", description: "Repository in 'owner/repo' format, e.g. 'torvalds/linux'" } },
    ),
    (c, a) => toolReachGithub(c, a),
    false,
    z.object({
      repo: z.string(),
    }),
  );

  reg(
    "reach_reddit",
    "Extract discussions, submissions, and top upvoted community comments from any subreddit or Reddit post URL.",
    P(
      "reach_reddit",
      "Extract Reddit discussion",
      { target: { type: "string", description: "Subreddit (e.g. 'r/technology') or full Reddit post URL" } },
    ),
    (c, a) => toolReachReddit(c, a),
    false,
    z.object({
      target: z.string(),
    }),
  );

  reg(
    "reach_youtube",
    "Extract video title, creator, metadata, and timed transcript/captions from any YouTube video URL or ID.",
    P(
      "reach_youtube",
      "Extract YouTube transcript",
      { videoIdOrUrl: { type: "string", description: "YouTube video URL or 11-character video ID" } },
    ),
    (c, a) => toolReachYouTube(c, a),
    false,
    z.object({
      videoIdOrUrl: z.string(),
    }),
  );

  reg(
    "reach_tweet",
    "View public Twitter/X post text, author info, likes, retweets, and media links without requiring a Twitter developer account.",
    P(
      "reach_tweet",
      "View Twitter/X post",
      { urlOrId: { type: "string", description: "Tweet URL or numeric Tweet ID" } },
    ),
    (c, a) => toolReachTweet(c, a),
    false,
    z.object({
      urlOrId: z.string(),
    }),
  );

  reg(
    "reach_rss",
    "Parse any RSS or Atom news feed to extract latest articles, publication timestamps, links, and snippets.",
    P(
      "reach_rss",
      "Parse RSS/Atom feed",
      { feedUrl: { type: "string", description: "RSS/Atom feed URL (e.g. 'https://news.ycombinator.com/rss')" } },
      { maxItems: { type: "number", description: "Max articles to retrieve (default: 6)" } },
    ),
    (c, a) => toolReachRss(c, a),
    false,
    z.object({
      feedUrl: z.string(),
      maxItems: z.number().optional(),
    }),
  );

  reg(
    "reach_doctor",
    "Run diagnostic connectivity checks across all Agent-Reach web channels (Web, GitHub, Reddit, YouTube, Twitter/X, RSS) and measure latency.",
    P("reach_doctor", "Agent-Reach Doctor diagnostics", {}),
    (c) => toolReachDoctor(c),
    false,
    z.object({}),
  );

  // ---------------------------------------------------------------- OpenBrowser Interactive Web Engine (ntegrals/openbrowser)

  reg(
    "browser_navigate",
    "Navigate the stateful browser to a URL. Returns the loaded page title, HTTP status, and a numbered tree of interactive DOM elements (#1, #2, etc.) for clicking and typing.",
    P(
      "browser_navigate",
      "Navigate browser to URL",
      { url: { type: "string", description: "Target URL (e.g. 'https://github.com')" } },
      { sessionId: { type: "string", description: "Browser session ID (default: 'default')" } },
    ),
    (c, a) => toolBrowserNavigate(c, a),
    false,
    z.object({
      url: z.string(),
      sessionId: z.string().optional(),
    }),
  );

  reg(
    "browser_click",
    "Click on an interactive link or button on the current page using its numbered element ID from the snapshot (e.g. elementId: 3).",
    P(
      "browser_click",
      "Click interactive element",
      { elementId: { type: "number", description: "Numbered element ID from browser snapshot" } },
      { sessionId: { type: "string", description: "Browser session ID" } },
    ),
    (c, a) => toolBrowserClick(c, a),
    false,
    z.object({
      elementId: z.number(),
      sessionId: z.string().optional(),
    }),
  );

  reg(
    "browser_type",
    "Type text into an input field or search bar on the current page using its numbered element ID.",
    P(
      "browser_type",
      "Type into input element",
      {
        elementId: { type: "number", description: "Numbered input element ID" },
        text: { type: "string", description: "Text string to enter" },
      },
      { sessionId: { type: "string", description: "Browser session ID" } },
    ),
    (c, a) => toolBrowserType(c, a),
    false,
    z.object({
      elementId: z.number(),
      text: z.string(),
      sessionId: z.string().optional(),
    }),
  );

  reg(
    "browser_submit",
    "Submit a form or search input on the current page. If elementId is provided, clicks that submit button; otherwise submits active form inputs.",
    P(
      "browser_submit",
      "Submit form",
      {},
      {
        elementId: { type: "number", description: "Optional submit button element ID" },
        sessionId: { type: "string", description: "Browser session ID" },
      },
    ),
    (c, a) => toolBrowserSubmit(c, a),
    false,
    z.object({
      elementId: z.number().optional(),
      sessionId: z.string().optional(),
    }),
  );

  reg(
    "browser_snapshot",
    "Get the current snapshot of the browser session showing the current URL, page title, numbered interactive elements tree, and visible text extract.",
    P(
      "browser_snapshot",
      "Get browser snapshot",
      {},
      { sessionId: { type: "string", description: "Browser session ID" } },
    ),
    (c, a) => toolBrowserSnapshot(c, a),
    false,
    z.object({
      sessionId: z.string().optional(),
    }),
  );

  // ---------------------------------------------------------------- AIPex Real Browser Automation Tools (AIPexStudio/AIPex)

  reg(
    "aipex_list_tabs",
    "List all open tabs in the user's connected real browser with their tab IDs, titles, active states, and URLs.",
    P("aipex_list_tabs", "List open browser tabs", {}),
    (c) => toolAipexListTabs(c),
    false,
    z.object({}),
  );

  reg(
    "aipex_switch_tab",
    "Switch the active browser focus to a specific tab by tab ID.",
    P(
      "aipex_switch_tab",
      "Switch active browser tab",
      { tabId: { type: "number", description: "Target tab ID" } },
    ),
    (c, a) => toolAipexSwitchTab(c, a),
    false,
    z.object({
      tabId: z.number(),
    }),
  );

  reg(
    "aipex_new_tab",
    "Open a new tab in the connected browser with a specific URL.",
    P(
      "aipex_new_tab",
      "Open new tab",
      { url: { type: "string", description: "URL to open" } },
      { title: { type: "string", description: "Optional title for tab" } },
    ),
    (c, a) => toolAipexNewTab(c, a),
    false,
    z.object({
      url: z.string(),
      title: z.string().optional(),
    }),
  );

  reg(
    "aipex_close_tab",
    "Close an open browser tab by tab ID.",
    P(
      "aipex_close_tab",
      "Close browser tab",
      { tabId: { type: "number", description: "Tab ID to close" } },
    ),
    (c, a) => toolAipexCloseTab(c, a),
    false,
    z.object({
      tabId: z.number(),
    }),
  );

  reg(
    "aipex_eval_script",
    "Evaluate a JavaScript expression directly in the context of an open browser tab (e.g. document.title, window.location.href, DOM extraction).",
    P(
      "aipex_eval_script",
      "Evaluate script in tab",
      {
        tabId: { type: "number", description: "Target tab ID" },
        code: { type: "string", description: "JavaScript code string" },
      },
    ),
    (c, a) => toolAipexEvalScript(c, a),
    false,
    z.object({
      tabId: z.number(),
      code: z.string(),
    }),
  );

  reg(
    "aipex_status",
    "Get current AIPex real browser bridge status, connected clients, active tab, and MCP server endpoint.",
    P("aipex_status", "Get AIPex bridge status", {}),
    (c) => toolAipexStatus(c),
    false,
    z.object({}),
  );

  // ---------------------------------------------------------------- Tencent BrowserSkill Debugging Tools (Tencent/BrowserSkill)

  reg(
    "bsk_open",
    "Open a web URL with BrowserSkill network traffic inspection and console logging.",
    P(
      "bsk_open",
      "Open URL with telemetry",
      { url: { type: "string", description: "Target URL to open" } },
      { sessionId: { type: "string", description: "Browser session ID" } },
    ),
    (c, a) => toolBskOpen(c, a),
    false,
    z.object({
      url: z.string(),
      sessionId: z.string().optional(),
    }),
  );

  reg(
    "bsk_console",
    "Inspect recent browser console logs (console.log, console.warn, console.error, JS exceptions) to troubleshoot broken or failing web applications.",
    P(
      "bsk_console",
      "Get browser console logs",
      {},
      {
        limit: { type: "number", description: "Max logs to retrieve (default: 20)" },
        level: { type: "string", enum: ["log", "warn", "error", "info"], description: "Filter by log level" },
      },
    ),
    (c, a) => toolBskConsole(c, a),
    false,
    z.object({
      limit: z.number().optional(),
      level: z.enum(["log", "warn", "error", "info"]).optional(),
    }),
  );

  reg(
    "bsk_network",
    "Inspect outgoing browser network requests (XHR/Fetch), response status codes (200, 404, 500), and latency to diagnose failing web endpoints.",
    P(
      "bsk_network",
      "Inspect browser network requests",
      {},
      {
        limit: { type: "number", description: "Max requests to retrieve (default: 20)" },
        search: { type: "string", description: "URL filter substring" },
      },
    ),
    (c, a) => toolBskNetwork(c, a),
    false,
    z.object({
      limit: z.number().optional(),
      search: z.string().optional(),
    }),
  );

  reg(
    "bsk_screenshot",
    "Capture a full-page rendered DOM snapshot of the current browser viewport and persist it directly into the encrypted vault at /browser/screenshots/.",
    P(
      "bsk_screenshot",
      "Capture browser screenshot to vault",
      {},
      {
        sessionId: { type: "string", description: "Browser session ID" },
        targetPath: { type: "string", description: "Custom vault path for markdown snapshot" },
      },
    ),
    (c, a) => toolBskScreenshot(c, a),
    false,
    z.object({
      sessionId: z.string().optional(),
      targetPath: z.string().optional(),
    }),
  );

  reg(
    "bsk_cli",
    "Execute a shell-native 'bsk' CLI command (e.g. 'bsk open <url>', 'bsk console', 'bsk network', 'bsk screenshot').",
    P(
      "bsk_cli",
      "Execute bsk shell command",
      { command: { type: "string", description: "Full bsk command string" } },
      { sessionId: { type: "string", description: "Browser session ID" } },
    ),
    (c, a) => toolBskCli(c, a),
    false,
    z.object({
      command: z.string(),
      sessionId: z.string().optional(),
    }),
  );

  reg(
    "digup_search",
    "Perform on-device hybrid semantic + FTS5 code and document search across the vault using Reciprocal Rank Fusion (RRF). Finds code by architectural purpose or intent.",
    P(
      "digup_search",
      "Hybrid semantic code & document search",
      { query: { type: "string", description: "Search query or natural language code intent" } },
      {
        limit: { type: "number", description: "Max results (default: 10)" },
        fileTypes: { type: "array", description: "Filter by file extensions (e.g. ['.ts', '.py', '.md'])" },
      },
    ),
    (c, a) => toolDigUpSearch(c, a),
    false,
    z.object({
      query: z.string(),
      limit: z.number().optional(),
      fileTypes: z.array(z.string()).optional(),
    }),
  );

  reg(
    "digup_index",
    "Index or re-index vault code and text files for hybrid semantic RRF search with syntax-aware language chunking.",
    P(
      "digup_index",
      "Index vault for hybrid code search",
      {},
      { dirPath: { type: "string", description: "Vault directory path to index (default: '/')" } },
    ),
    (c, a) => toolDigUpIndex(c, a),
    false,
    z.object({
      dirPath: z.string().optional(),
    }),
  );

  reg(
    "digup_stats",
    "Retrieve statistics about the DigUp on-device hybrid code search index.",
    P("digup_stats", "Get DigUp index stats", {}),
    (c) => toolDigUpStats(c),
    false,
    z.object({}),
  );

  // ---------------------------------------------------------------- ruflo swarm tools

  reg(
    "swarm_spawn",
    "Spawn an autonomous multi-agent swarm team with specified topology ('mesh', 'hierarchical', 'star', or 'consensus') to achieve a complex goal.",
    P(
      "swarm_spawn",
      "Spawn multi-agent swarm team",
      { goal: { type: "string", description: "Objective or problem for the swarm to solve" } },
      { topology: { type: "string", description: "Swarm topology: 'mesh' | 'hierarchical' | 'star' | 'consensus' (default: 'hierarchical')" } },
    ),
    (c, a) => toolSwarmSpawn(c, a),
    false,
    z.object({
      goal: z.string(),
      topology: z.enum(["mesh", "hierarchical", "star", "consensus"]).optional(),
    }),
  );

  reg(
    "swarm_step",
    "Advance the current multi-agent swarm session by one turn, executing the next pending DAG sub-task with specialized agent roles.",
    P("swarm_step", "Execute next swarm turn", {}),
    (c) => toolSwarmStep(c),
    false,
    z.object({}),
  );

  reg(
    "swarm_consensus",
    "Conduct a confidence-weighted consensus vote across all swarm agents on a proposal, draft, or deliverable.",
    P(
      "swarm_consensus",
      "Conduct swarm consensus vote",
      { proposal: { type: "string", description: "Proposal text or plan to evaluate" } },
      {
        taskId: { type: "string", description: "Associated task ID" },
        threshold: { type: "number", description: "Consensus threshold score (0.0 to 1.0, default: 0.67)" },
      },
    ),
    (c, a) => toolSwarmConsensus(c, a),
    false,
    z.object({
      proposal: z.string(),
      taskId: z.string().optional(),
      threshold: z.number().optional(),
    }),
  );

  reg(
    "swarm_blackboard_post",
    "Publish an update, observation, or artifact to the shared swarm blackboard memory mesh.",
    P(
      "swarm_blackboard_post",
      "Publish to swarm blackboard",
      {
        topic: { type: "string", description: "Topic category (e.g. 'architecture', 'security', 'finding')" },
        content: { type: "string", description: "Message or finding text" },
      },
      { tags: { type: "array", description: "Keywords or tags" } },
    ),
    (c, a) => toolSwarmBlackboardPost(c, a),
    false,
    z.object({
      topic: z.string(),
      content: z.string(),
      tags: z.array(z.string()).optional(),
    }),
  );

  reg(
    "swarm_blackboard_read",
    "Read recent entries from the shared swarm blackboard memory mesh.",
    P(
      "swarm_blackboard_read",
      "Read swarm blackboard memory",
      {},
      {
        topic: { type: "string", description: "Filter by topic" },
        limit: { type: "number", description: "Max entries (default: 10)" },
      },
    ),
    (c, a) => toolSwarmBlackboardRead(c, a),
    false,
    z.object({
      topic: z.string().optional(),
      limit: z.number().optional(),
    }),
  );

  reg(
    "swarm_status",
    "Inspect the active multi-agent swarm topology, active roster, DAG task progress, and blackboard metrics.",
    P("swarm_status", "Get swarm status", {}),
    (c) => toolSwarmStatus(c),
    false,
    z.object({}),
  );

  // ---------------------------------------------------------------- orca fleet tools

  reg(
    "orca_fleet_list",
    "List all active isolated agent git worktrees in the repository, their branches, head commits, ahead/behind counts, and mergeability status.",
    P(
      "orca_fleet_list",
      "List active agent worktrees",
      {},
      { baseBranch: { type: "string", description: "Target base branch (default: 'main')" } },
    ),
    (c, a) => toolOrcaFleetList(c, a),
    false,
    z.object({
      baseBranch: z.string().optional(),
    }),
  );

  reg(
    "orca_create_worktree",
    "Create an isolated git worktree for an AI agent or task to prevent working directory conflicts.",
    P(
      "orca_create_worktree",
      "Create isolated agent worktree",
      { name: { type: "string", description: "Agent or task slug name" } },
      { baseBranch: { type: "string", description: "Base branch to branch off (default: 'main')" } },
    ),
    (c, a) => toolOrcaCreateWorktree(c, a),
    false,
    z.object({
      name: z.string(),
      baseBranch: z.string().optional(),
    }),
  );

  reg(
    "orca_worktree_diff",
    "Inspect 3-way structured git diff between an agent worktree branch and base branch (modified files, line insertions, deletions, patches).",
    P(
      "orca_worktree_diff",
      "Inspect agent worktree diff",
      { name: { type: "string", description: "Worktree name" } },
      { baseBranch: { type: "string", description: "Target base branch (default: 'main')" } },
    ),
    (c, a) => toolOrcaWorktreeDiff(c, a),
    false,
    z.object({
      name: z.string(),
      baseBranch: z.string().optional(),
    }),
  );

  reg(
    "orca_dry_run_merge",
    "Simulate a merge between an agent worktree branch and base branch to detect conflicts before executing the merge.",
    P(
      "orca_dry_run_merge",
      "Simulate worktree merge",
      { name: { type: "string", description: "Worktree name" } },
      { baseBranch: { type: "string", description: "Target base branch (default: 'main')" } },
    ),
    (c, a) => toolOrcaDryRunMerge(c, a),
    false,
    z.object({
      name: z.string(),
      baseBranch: z.string().optional(),
    }),
  );

  reg(
    "orca_merge_worktree",
    "Atomically merge an agent worktree branch into base branch with automated conflict verification and worktree pruning.",
    P(
      "orca_merge_worktree",
      "Merge agent worktree into base",
      { name: { type: "string", description: "Worktree name" } },
      {
        baseBranch: { type: "string", description: "Target base branch (default: 'main')" } ,
        squash: { type: "boolean", description: "Squash commits into single commit" },
        prune: { type: "boolean", description: "Prune worktree directory after merge (default: true)" },
      },
    ),
    (c, a) => toolOrcaMergeWorktree(c, a),
    false,
    z.object({
      name: z.string(),
      baseBranch: z.string().optional(),
      squash: z.boolean().optional(),
      prune: z.boolean().optional(),
    }),
  );

  // ---------------------------------------------------------------- paperclip org & governance tools

  reg(
    "paperclip_org_chart",
    "Inspect the virtual AI company organization chart, departments, agent hierarchy, and reporting lines.",
    P("paperclip_org_chart", "Get virtual AI org chart", {}),
    (c) => toolPaperclipOrgChart(c),
    false,
    z.object({}),
  );

  reg(
    "paperclip_budget_status",
    "Retrieve token/USD expenditure tracking, daily/monthly budget caps, and emergency hard-stop status for agents.",
    P(
      "paperclip_budget_status",
      "Inspect agent budget and hard-stops",
      {},
      { memberId: { type: "string", description: "Member ID to inspect (omit for company overview)" } },
    ),
    (c, a) => toolPaperclipBudgetStatus(c, a),
    false,
    z.object({
      memberId: z.string().optional(),
    }),
  );

  reg(
    "paperclip_run_standup",
    "Trigger the autonomous daily standup routine for the AI coworker fleet and synthesize an executive briefing.",
    P("paperclip_run_standup", "Execute daily standup routine", {}),
    (c) => toolPaperclipRunStandup(c),
    false,
    z.object({}),
  );

  reg(
    "paperclip_governance_queue",
    "List pending human-in-the-loop governance approval requests for high-risk actions (e.g. bash commands, git merge, file purge).",
    P("paperclip_governance_queue", "List pending governance approvals", {}),
    (c) => toolPaperclipGovernanceQueue(c),
    false,
    z.object({}),
  );

  reg(
    "paperclip_approve_action",
    "Approve or reject a gated governance request in the approval queue.",
    P(
      "paperclip_approve_action",
      "Resolve governance approval",
      {
        id: { type: "string", description: "Approval request ID" },
        decision: { type: "string", description: "'approved' | 'rejected'" },
      },
      { reason: { type: "string", description: "Supervisor review note" } },
    ),
    (c, a) => toolPaperclipApproveAction(c, a),
    false,
    z.object({
      id: z.string(),
      decision: z.enum(["approved", "rejected"]),
      reason: z.string().optional(),
    }),
  );

  // ---------------------------------------------------------------- ifixai audit tools

  reg(
    "ifixai_audit_dot",
    "Run independent behavioral and misalignment diagnostic audit on an agent's prompt or instructions (prompt injection, tool safety, key leaks).",
    P(
      "ifixai_audit_dot",
      "Audit agent prompt for security risks",
      {
        dotName: { type: "string", description: "Target agent/dot name" },
        promptContent: { type: "string", description: "Prompt text or system instructions to evaluate" },
      },
    ),
    (c, a) => toolIFixAiAuditDot(c, a),
    false,
    z.object({
      dotName: z.string(),
      promptContent: z.string(),
    }),
  );

  reg(
    "ifixai_audit_vault",
    "Scan vault code and documentation files for dangerous shell commands, eval patterns, and un-sanitized SQL.",
    P(
      "ifixai_audit_vault",
      "Scan vault files for security vulnerabilities",
      {},
      { targetDir: { type: "string", description: "Directory to scan (default: '/')" } },
    ),
    (c, a) => toolIFixAiAuditVault(c, a),
    false,
    z.object({
      targetDir: z.string().optional(),
    }),
  );

  reg(
    "ifixai_get_scorecard",
    "Retrieve the latest overall security scorecard, letter grade (A+, A, B, C, F), and remediation recommendations.",
    P("ifixai_get_scorecard", "Get security scorecard", {}),
    (c) => toolIFixAiGetScorecard(c),
    false,
    z.object({}),
  );

  // ---------------------------------------------------------------- ecc tools

  reg(
    "ecc_list_rules",
    "List active surgical prompt contracts, engineering guidelines, and learned lessons from prior executions.",
    P(
      "ecc_list_rules",
      "List surgical rules and contracts",
      {},
      { category: { type: "string", description: "Filter by category: 'coding' | 'safety' | 'formatting' | 'workflow' | 'user_preference'" } },
    ),
    (c, a) => toolEccListRules(c, a),
    false,
    z.object({
      category: z.string().optional(),
    }),
  );

  reg(
    "ecc_learn_rule",
    "Persist a new learned rule or engineering constraint into the permanent vault rulebook so future agent turns never repeat the same mistake.",
    P(
      "ecc_learn_rule",
      "Persist learned rule to rulebook",
      {
        title: { type: "string", description: "Rule title or constraint summary" },
        ruleText: { type: "string", description: "Detailed rule instruction" },
      },
      { category: { type: "string", description: "Category: 'coding' | 'safety' | 'formatting' | 'workflow' | 'user_preference'" } },
    ),
    (c, a) => toolEccLearnRule(c, a),
    false,
    z.object({
      title: z.string(),
      ruleText: z.string(),
      category: z.enum(["coding", "safety", "formatting", "workflow", "user_preference"]).optional(),
    }),
  );

  reg(
    "ecc_verify_gate",
    "Evaluate execution quality against the ECC Quality Verification Gate (type check, build verification, comment preservation, scope confinement).",
    P(
      "ecc_verify_gate",
      "Verify quality verification gate",
      {
        hasTypeScriptPassed: { type: "boolean", description: "Did tsc --noEmit pass?" },
        hasBuildPassed: { type: "boolean", description: "Did production build pass?" },
        commentsPreserved: { type: "boolean", description: "Were existing comments preserved?" },
        unrelatedDiffsAvoided: { type: "boolean", description: "Were out-of-scope diffs avoided?" },
      },
    ),
    (c, a) => toolEccVerifyGate(c, a),
    false,
    z.object({
      hasTypeScriptPassed: z.boolean(),
      hasBuildPassed: z.boolean(),
      commentsPreserved: z.boolean(),
      unrelatedDiffsAvoided: z.boolean(),
    }),
  );

  reg(
    "ecc_get_contract",
    "Retrieve system prompt contract rules for planning, implementation, or verification phases.",
    P(
      "ecc_get_contract",
      "Get prompt contract rules",
      {},
      { phase: { type: "string", description: "Phase: 'plan' | 'implement' | 'verify'" } },
    ),
    (c, a) => toolEccGetContract(c, a),
    false,
    z.object({
      phase: z.enum(["plan", "implement", "verify"]).optional(),
    }),
  );

  // ---------------------------------------------------------------- hermes tools

  reg(
    "hermes_synthesize_tool",
    "Autonomously synthesize a new executable JavaScript tool on the fly, validate its execution, and register it permanently into the active tool suite.",
    P(
      "hermes_synthesize_tool",
      "Synthesize dynamic tool on the fly",
      {
        name: { type: "string", description: "Tool function name (letters, numbers, underscore)" },
        description: { type: "string", description: "What the tool does" },
        code: { type: "string", description: "JavaScript function body returning the result" },
      },
      { parameters: { type: "array", description: "List of parameter descriptors ({ name, type, description, required })" } },
    ),
    (c, a) => toolHermesSynthesizeTool(c, a),
    false,
    z.object({
      name: z.string(),
      description: z.string(),
      code: z.string(),
      parameters: z.array(z.object({
        name: z.string(),
        type: z.enum(["string", "number", "boolean"]),
        description: z.string(),
        required: z.boolean().optional(),
      })).optional(),
    }),
  );

  reg(
    "hermes_list_synthesized_tools",
    "List all dynamically synthesized tools currently compiled and available in the Hermes skill mesh.",
    P("hermes_list_synthesized_tools", "List synthesized dynamic tools", {}),
    (c) => toolHermesListSynthesizedTools(c),
    false,
    z.object({}),
  );

  reg(
    "hermes_reflect_turn",
    "Perform a multi-turn reflection analysis on recent agent execution to compute goal alignment, efficiency scores, and continuous improvement takeaways.",
    P(
      "hermes_reflect_turn",
      "Perform multi-turn reflection",
      { taskGoal: { type: "string", description: "Target objective or user request" } },
      { steps: { type: "array", description: "List of tool execution steps" } },
    ),
    (c, a) => toolHermesReflectTurn(c, a),
    false,
    z.object({
      taskGoal: z.string(),
      steps: z.array(z.object({
        tool: z.string(),
        resultSnippet: z.string(),
        success: z.boolean(),
      })).optional(),
    }),
  );

  reg(
    "hermes_export_trajectory",
    "Export current session interaction trajectory into JSON Lines format stored permanently in the encrypted vault.",
    P(
      "hermes_export_trajectory",
      "Export session trajectory to vault",
      {},
      { sessionId: { type: "string", description: "Custom session ID" } },
    ),
    (c, a) => toolHermesExportTrajectory(c, a),
    false,
    z.object({
      sessionId: z.string().optional(),
    }),
  );
}

/** Test hook */
export function _resetAgentTools(): void {
  registered = false;
}
