import type Database from "better-sqlite3";

/**
 * P5: server-side CRUD for the plaintext tracking domain (projects, tasks,
 * dependencies, time entries). One implementation shared by the API routes
 * (the UI) — the P4 agent tools keep their own inline SQL.
 *
 * All timestamps: dates are TEXT 'YYYY-MM-DD'; event/stamp columns are
 * INTEGER UTC ms. `blocked_by_dependencies` is the P5 rule: a task cannot
 * be completed while any task that blocks it is still open.
 */

export interface TrackingCtx {
  db: Database.Database;
}

export class TrackingError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "invalid"
      | "blocked_by_dependencies"
      | "dep_cycle",
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TrackingError";
  }
}

// ------------------------------------------------------------ row shapes

export interface ProjectRow {
  id: number;
  title: string;
  description: string | null;
  color: string | null;
  status: "active" | "archived";
  startDate: string | null;
  endDate: string | null;
  createdAt: number;
  updatedAt: number;
  taskCount: number;
  doneCount: number;
}

export interface TaskRow {
  id: number;
  projectId: number | null;
  projectTitle: string | null;
  title: string;
  description: string | null;
  status: "todo" | "doing" | "done";
  priority: number;
  dueDate: string | null;
  startDate: string | null;
  tags: string[];
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TimeEntryRow {
  id: number;
  taskId: number | null;
  projectId: number | null;
  startedAt: number;
  durationSec: number;
  note: string | null;
  createdAt: number;
}

const PROJECT_COLS = `p.id, p.title, p.description, p.color, p.status,
  p.start_date AS startDate, p.end_date AS endDate,
  p.created_at AS createdAt, p.updated_at AS updatedAt`;

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function mapTask(r: Record<string, unknown>, db?: Database.Database): TaskRow {
  let projectTitle: string | null = null;
  if ("projectTitle" in r) {
    projectTitle = (r.projectTitle as string | null) ?? null;
  } else if (r.projectId != null && db) {
    const projectRow = db.prepare("SELECT title FROM projects WHERE id = ?").get(r.projectId as number) as { title: string } | undefined;
    projectTitle = projectRow?.title ?? null;
  }
  return {
    id: r.id as number,
    projectId: (r.projectId as number | null) ?? null,
    projectTitle,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    status: r.status as TaskRow["status"],
    priority: r.priority as number,
    dueDate: (r.dueDate as string | null) ?? null,
    startDate: (r.startDate as string | null) ?? null,
    tags: parseTags(r.tags as string | null),
    completedAt: (r.completedAt as number | null) ?? null,
    createdAt: r.createdAt as number,
    updatedAt: r.updatedAt as number,
  };
}

// ------------------------------------------------------------ projects

export function listProjects(
  ctx: TrackingCtx,
  opts: { includeArchived?: boolean } = {},
): ProjectRow[] {
  const where = opts.includeArchived ? "" : "WHERE p.status = 'active'";
  const rows = ctx.db
    .prepare(
      `SELECT ${PROJECT_COLS},
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS taskCount,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS doneCount
       FROM projects p ${where}
       ORDER BY p.updated_at DESC`,
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    color: (r.color as string | null) ?? null,
    status: r.status as ProjectRow["status"],
    startDate: (r.startDate as string | null) ?? null,
    endDate: (r.endDate as string | null) ?? null,
    createdAt: r.createdAt as number,
    updatedAt: r.updatedAt as number,
    taskCount: r.taskCount as number,
    doneCount: r.doneCount as number,
  }));
}

export function getProject(ctx: TrackingCtx, id: number): ProjectRow | null {
  const r = ctx.db
    .prepare(`SELECT ${PROJECT_COLS} FROM projects p WHERE p.id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: r.id as number,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    color: (r.color as string | null) ?? null,
    status: r.status as ProjectRow["status"],
    startDate: (r.startDate as string | null) ?? null,
    endDate: (r.endDate as string | null) ?? null,
    createdAt: r.createdAt as number,
    updatedAt: r.updatedAt as number,
    taskCount: 0,
    doneCount: 0,
  };
}

export function createProject(
  ctx: TrackingCtx,
  input: {
    title: string;
    description?: string | null;
    color?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
): ProjectRow {
  const now = Date.now();
  const title = input.title.trim();
  if (!title) throw new TrackingError("invalid", "Project title is required");
  const r = ctx.db
    .prepare(
      `INSERT INTO projects (title, description, color, status, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
    )
    .run(
      title,
      input.description?.trim() ? input.description.trim() : null,
      input.color ?? null,
      input.startDate ?? null,
      input.endDate ?? null,
      now,
      now,
    );
  const p = getProject(ctx, Number(r.lastInsertRowid));
  if (!p) throw new TrackingError("not_found", "Project vanished after insert");
  p.taskCount = 0;
  p.doneCount = 0;
  return p;
}

export function updateProject(
  ctx: TrackingCtx,
  id: number,
  patch: {
    title?: string;
    description?: string | null;
    color?: string | null;
    status?: "active" | "archived";
    startDate?: string | null;
    endDate?: string | null;
  },
): ProjectRow {
  const p = getProject(ctx, id);
  if (!p) throw new TrackingError("not_found", `Project ${id} not found`);
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new TrackingError("invalid", "Project title cannot be empty");
    sets.push("title = ?");
    params.push(t);
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    params.push(patch.description?.trim() ? patch.description.trim() : null);
  }
  if (patch.color !== undefined) {
    sets.push("color = ?");
    params.push(patch.color ?? null);
  }
  if (patch.startDate !== undefined) {
    sets.push("start_date = ?");
    params.push(patch.startDate ?? null);
  }
  if (patch.endDate !== undefined) {
    sets.push("end_date = ?");
    params.push(patch.endDate ?? null);
  }
  if (patch.status !== undefined) {
    if (patch.status !== "active" && patch.status !== "archived")
      throw new TrackingError("invalid", "status must be active|archived");
    sets.push("status = ?");
    params.push(patch.status);
  }
  if (sets.length) {
    sets.push("updated_at = ?");
    params.push(Date.now(), id);
    ctx.db
      .prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`)
      .run(...params);
  }
  return getProject(ctx, id)!;
}

/** Hard delete with cascade (tasks, both directions of deps, time entries). */
export function deleteProject(ctx: TrackingCtx, id: number): void {
  const p = getProject(ctx, id);
  if (!p) throw new TrackingError("not_found", `Project ${id} not found`);
  const tx = ctx.db.transaction(() => {
    const taskIds = (
      ctx.db
        .prepare("SELECT id FROM tasks WHERE project_id = ?")
        .all(id) as { id: number }[]
    ).map((t) => t.id);
    if (taskIds.length) {
      const ph = taskIds.map(() => "?").join(",");
      ctx.db
        .prepare(
          `DELETE FROM task_deps WHERE task_id IN (${ph}) OR blocks_task_id IN (${ph})`,
        )
        .run(...taskIds, ...taskIds);
      ctx.db
        .prepare(`DELETE FROM time_entries WHERE task_id IN (${ph})`)
        .run(...taskIds);
      ctx.db.prepare(`DELETE FROM tasks WHERE id IN (${ph})`).run(...taskIds);
    }
    ctx.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  });
  tx();
}

// ------------------------------------------------------------ tasks

const TASK_SELECT = `SELECT t.id, t.project_id AS projectId, p.title AS projectTitle, t.title, t.description,
      t.status, t.priority, t.due_date AS dueDate, t.start_date AS startDate,
      t.tags, t.completed_at AS completedAt, t.created_at AS createdAt, t.updated_at AS updatedAt
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id`;

export function listTasks(
  ctx: TrackingCtx,
  opts: {
    projectId?: number;
    status?: TaskRow["status"];
    limit?: number;
  } = {},
): TaskRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.projectId !== undefined) {
    where.push("t.project_id = ?");
    params.push(opts.projectId);
  }
  if (opts.status) {
    where.push("t.status = ?");
    params.push(opts.status);
  }
  const rows = ctx.db
    .prepare(
      `${TASK_SELECT}
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY t.priority DESC, t.due_date IS NULL, t.due_date, t.id
       LIMIT ?`,
    )
    .all(...params, Math.max(1, Math.min(500, opts.limit ?? 200))) as Record<
    string,
    unknown
  >[];
  return rows.map((r) => mapTask(r, ctx.db));
}

export function getTask(ctx: TrackingCtx, id: number): TaskRow {
  const r = ctx.db
    .prepare(`${TASK_SELECT} WHERE t.id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!r) throw new TrackingError("not_found", `Task ${id} not found`);
  return mapTask(r, ctx.db);
}

export function createTask(
  ctx: TrackingCtx,
  input: {
    projectId?: number | null;
    title: string;
    description?: string | null;
    status?: TaskRow["status"];
    priority?: number;
    dueDate?: string | null;
    startDate?: string | null;
    tags?: string[];
  },
): TaskRow {
  const title = input.title.trim();
  if (!title) throw new TrackingError("invalid", "Task title is required");
  const status = input.status ?? "todo";
  if (!["todo", "doing", "done"].includes(status))
    throw new TrackingError("invalid", "status must be todo|doing|done");
  const priority = input.priority ?? 1;
  if (priority < 0 || priority > 3)
    throw new TrackingError("invalid", "priority must be 0..3");
  const now = Date.now();
  const completedAt = status === "done" ? now : null;
  const r = ctx.db
    .prepare(
      `INSERT INTO tasks (project_id, title, description, status, priority,
        due_date, start_date, tags, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.projectId ?? null,
      title,
      input.description?.trim() ? input.description.trim() : null,
      status,
      priority,
      input.dueDate ?? null,
      input.startDate ?? null,
      input.tags?.length ? JSON.stringify(input.tags) : null,
      completedAt,
      now,
      now,
    );
  return getTask(ctx, Number(r.lastInsertRowid));
}

/**
 * Update a task. Enforces the P5 rule: moving to `done` is rejected with
 * `blocked_by_dependencies` while any task that blocks it is still open.
 */
export function updateTask(
  ctx: TrackingCtx,
  id: number,
  patch: {
    projectId?: number | null;
    title?: string;
    description?: string | null;
    status?: TaskRow["status"];
    priority?: number;
    dueDate?: string | null;
    startDate?: string | null;
    tags?: string[];
  },
): TaskRow {
  const t = getTask(ctx, id);
  const newStatus = patch.status ?? t.status;
  if (!["todo", "doing", "done"].includes(newStatus))
    throw new TrackingError("invalid", "status must be todo|doing|done");
  if (patch.priority !== undefined && (patch.priority < 0 || patch.priority > 3))
    throw new TrackingError("invalid", "priority must be 0..3");

  if (newStatus === "done" && t.status !== "done") {
    const blockers = openBlockers(ctx, id);
    if (blockers.length)
      throw new TrackingError(
        "blocked_by_dependencies",
        `Task ${id} is blocked by ${blockers.length} open task(s)`,
        { blocking: blockers.map((b) => ({ id: b.id, title: b.title })) },
      );
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.projectId !== undefined) {
    sets.push("project_id = ?");
    params.push(patch.projectId);
  }
  if (patch.title !== undefined) {
    const tt = patch.title.trim();
    if (!tt) throw new TrackingError("invalid", "Task title cannot be empty");
    sets.push("title = ?");
    params.push(tt);
  }
  if (patch.description !== undefined) {
    sets.push("description = ?");
    params.push(patch.description?.trim() ? patch.description.trim() : null);
  }
  if (patch.priority !== undefined) {
    sets.push("priority = ?");
    params.push(patch.priority);
  }
  if (patch.dueDate !== undefined) {
    sets.push("due_date = ?");
    params.push(patch.dueDate ?? null);
  }
  if (patch.startDate !== undefined) {
    sets.push("start_date = ?");
    params.push(patch.startDate ?? null);
  }
  if (patch.tags !== undefined) {
    sets.push("tags = ?");
    params.push(patch.tags?.length ? JSON.stringify(patch.tags) : null);
  }
  if (patch.status !== undefined) {
    sets.push("status = ?", "completed_at = ?");
    params.push(newStatus, newStatus === "done" ? Date.now() : null);
  }
  if (sets.length) {
    sets.push("updated_at = ?");
    params.push(Date.now(), id);
    ctx.db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(
      ...params,
    );
  }
  return getTask(ctx, id);
}

export function deleteTask(ctx: TrackingCtx, id: number): void {
  getTask(ctx, id);
  const tx = ctx.db.transaction(() => {
    ctx.db
      .prepare("DELETE FROM task_deps WHERE task_id = ? OR blocks_task_id = ?")
      .run(id, id);
    ctx.db.prepare("DELETE FROM time_entries WHERE task_id = ?").run(id);
    ctx.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  });
  tx();
}

/** Tasks that block `taskId` and are not done (the 409 rule's offenders). */
export function openBlockers(ctx: TrackingCtx, taskId: number): TaskRow[] {
  const rows = ctx.db
    .prepare(
      `SELECT d.task_id AS blockerId FROM task_deps d
       JOIN tasks b ON b.id = d.task_id
       WHERE d.blocks_task_id = ? AND b.status != 'done'`,
    )
    .all(taskId) as { blockerId: number }[];
  return rows.map((r) => getTask(ctx, r.blockerId));
}

/** Both directions of a task's dependency edges, as full rows. */
export function taskDependencies(
  ctx: TrackingCtx,
  taskId: number,
): { blockers: TaskRow[]; blocked: TaskRow[] } {
  getTask(ctx, taskId); // 404 if unknown
  const blockerRows = ctx.db
    .prepare(
      `SELECT d.task_id AS id FROM task_deps d WHERE d.blocks_task_id = ?`,
    )
    .all(taskId) as { id: number }[];
  const blockedRows = ctx.db
    .prepare(
      `SELECT d.blocks_task_id AS id FROM task_deps d WHERE d.task_id = ?`,
    )
    .all(taskId) as { id: number }[];
  return {
    blockers: blockerRows.map((r) => getTask(ctx, r.id)),
    blocked: blockedRows.map((r) => getTask(ctx, r.id)),
  };
}

/** All dependency edges (bulk) — powers the board's blocked-count + Gantt links. */
export function listTaskDeps(
  ctx: TrackingCtx,
  opts: { limit?: number } = {},
): { taskId: number; blocksTaskId: number }[] {
  return ctx.db
    .prepare(
      `SELECT task_id AS taskId, blocks_task_id AS blocksTaskId FROM task_deps LIMIT ?`,
    )
    .all(Math.max(1, Math.min(1000, opts.limit ?? 500))) as {
    taskId: number;
    blocksTaskId: number;
  }[];
}

/**
 * Add edge `taskId` blocks `blocksTaskId`. Rejects self-edges and cycles.
 *
 * Convention: a row `(taskId, blocksTaskId)` in `task_deps` means "taskId
 * blocks blocksTaskId" — blocksTaskId cannot complete until taskId is done.
 *
 * Cycle check: adding `taskId → blocksTaskId` creates a cycle iff
 * `blocksTaskId` can already reach `taskId` through existing transitive
 * "blocks" edges.
 */
export function addTaskDependency(
  ctx: TrackingCtx,
  input: { taskId: number; blocksTaskId: number },
): void {
  const { taskId, blocksTaskId } = input;
  getTask(ctx, taskId);
  getTask(ctx, blocksTaskId);
  if (taskId === blocksTaskId)
    throw new TrackingError("invalid", "A task cannot block itself");
  if (
    ctx.db
      .prepare(
        "SELECT 1 FROM task_deps WHERE task_id = ? AND blocks_task_id = ?",
      )
      .get(taskId, blocksTaskId)
  )
    return; // idempotent — edge already present
  // Cycle check: adding `taskId → blocksTaskId` creates a cycle iff there's
  // any existing path from blocksTaskId back to taskId (in either direction).
  // Bidirectional BFS to cover all transitive relationships.
  const blocksForward = ctx.db.prepare(
    "SELECT blocks_task_id AS nid FROM task_deps WHERE task_id = ?",
  );
  const blocksBackward = ctx.db.prepare(
    "SELECT task_id AS nid FROM task_deps WHERE blocks_task_id = ?",
  );
  const queue: number[] = [blocksTaskId];
  const seen = new Set<number>([blocksTaskId]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === taskId)
      throw new TrackingError(
        "dep_cycle",
        "This dependency would create a cycle",
      );
    for (const prep of [blocksForward, blocksBackward]) {
      const rows = prep.all(cur) as { nid: number }[];
      for (const r of rows) {
        if (!seen.has(r.nid)) {
          seen.add(r.nid);
          queue.push(r.nid);
        }
      }
    }
  }
  ctx.db
    .prepare("INSERT INTO task_deps (task_id, blocks_task_id) VALUES (?, ?)")
    .run(taskId, blocksTaskId);
}

export function removeTaskDependency(
  ctx: TrackingCtx,
  input: { taskId: number; blocksTaskId: number },
): void {
  ctx.db
    .prepare("DELETE FROM task_deps WHERE task_id = ? AND blocks_task_id = ?")
    .run(input.taskId, input.blocksTaskId);
}

// ------------------------------------------------------------ time

export function listTimeEntries(
  ctx: TrackingCtx,
  opts: { taskId?: number; projectId?: number; limit?: number } = {},
): TimeEntryRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.taskId !== undefined) {
    where.push("task_id = ?");
    params.push(opts.taskId);
  }
  if (opts.projectId !== undefined) {
    where.push("project_id = ?");
    params.push(opts.projectId);
  }
  return ctx.db
    .prepare(
      `SELECT id, task_id AS taskId, project_id AS projectId, started_at AS startedAt,
        duration_sec AS durationSec, note, created_at AS createdAt
       FROM time_entries
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(
      ...params,
      Math.max(1, Math.min(500, opts.limit ?? 200)),
    ) as TimeEntryRow[];
}

export function addTimeEntry(
  ctx: TrackingCtx,
  input: {
    taskId?: number | null;
    projectId?: number | null;
    startedAt?: number;
    durationSec: number;
    note?: string | null;
  },
): TimeEntryRow {
  if (!(input.durationSec > 0))
    throw new TrackingError("invalid", "durationSec must be positive");
  if (input.taskId !== undefined && input.taskId !== null)
    getTask(ctx, input.taskId);
  const startedAt =
    input.startedAt ?? Math.max(0, Date.now() - input.durationSec * 1000);
  const r = ctx.db
    .prepare(
      `INSERT INTO time_entries (task_id, project_id, started_at, duration_sec, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.taskId ?? null,
      input.projectId ?? null,
      startedAt,
      Math.round(input.durationSec),
      input.note?.trim() ? input.note.trim() : null,
      Date.now(),
    );
  const row = ctx.db
    .prepare(
      `SELECT id, task_id AS taskId, project_id AS projectId, started_at AS startedAt,
        duration_sec AS durationSec, note, created_at AS createdAt
       FROM time_entries WHERE id = ?`,
    )
    .get(Number(r.lastInsertRowid)) as TimeEntryRow;
  return row;
}

export function deleteTimeEntry(
  ctx: TrackingCtx,
  id: number,
  taskId?: number,
): void {
  const where = taskId !== undefined ? "id = ? AND task_id = ?" : "id = ?";
  const params = taskId !== undefined ? [id, taskId] : [id];
  const r = ctx.db.prepare(`DELETE FROM time_entries WHERE ${where}`).run(...params);
  if (r.changes === 0)
    throw new TrackingError("not_found", `Time entry ${id} not found`);
}
