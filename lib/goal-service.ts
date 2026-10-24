/**
 * P6: server-side CRUD for goals and milestones.
 *
 * Importers/callers:
 *   - app/api/goals/route.ts (GET/POST)
 *   - app/api/goals/[id]/route.ts (GET/PATCH/DELETE)
 *   - app/api/goals/[id]/milestones/route.ts (GET/POST)
 *   - app/api/goals/[id]/milestones/[mid]/route.ts (PATCH/DELETE)
 *   - Agent tools in lib/agent/tools/goals-events.ts
 *
 * Data schemas: goals, goal_milestones (from lib/db/schema.ts)
 */

import type Database from "better-sqlite3";

export interface GoalCtx {
  db: Database.Database;
}

export class GoalError extends Error {
  constructor(
    readonly code: "not_found" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "GoalError";
  }
}

// ------------------------------------------------------------ row shapes

export interface MilestoneRow {
  id: number;
  goalId: number;
  title: string;
  dueDate: string | null;
  done: boolean;
  createdAt: number;
}

export interface GoalRow {
  id: number;
  title: string;
  description: string | null;
  targetDate: string | null;
  progressPct: number;
  milestoneCount: number;
  doneMilestoneCount: number;
  createdAt: number;
  updatedAt: number;
  milestones: MilestoneRow[];
}

// ------------------------------------------------------------ goals

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function listGoals(ctx: GoalCtx): GoalRow[] {
  const rows = ctx.db.prepare(`
    SELECT
      g.id, g.title, g.description, g.target_date AS targetDate,
      g.progress_pct AS progressPct, g.created_at AS createdAt, g.updated_at AS updatedAt,
      COUNT(m.id) AS milestoneCount,
      SUM(CASE WHEN m.done THEN 1 ELSE 0 END) AS doneMilestoneCount
    FROM goals g
    LEFT JOIN goal_milestones m ON m.goal_id = g.id
    GROUP BY g.id
    ORDER BY g.target_date ASC NULLS LAST, g.created_at DESC
  `).all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as number,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    targetDate: (r.targetDate ?? r.target_date ?? null) as string | null,
    progressPct: Number(r.progressPct ?? r.progress_pct ?? 0),
    milestoneCount: Number(r.milestoneCount ?? 0),
    doneMilestoneCount: Number(r.doneMilestoneCount ?? r.done_milestone_count ?? 0),
    createdAt: Number(r.createdAt ?? r.created_at ?? 0),
    updatedAt: Number(r.updatedAt ?? r.updated_at ?? 0),
    milestones: [],
  }));
}

export function getGoal(ctx: GoalCtx, id: number): GoalRow | null {
  const r = ctx.db.prepare(`
    SELECT
      g.id, g.title, g.description, g.target_date AS targetDate,
      g.progress_pct AS progressPct, g.created_at AS createdAt, g.updated_at AS updatedAt,
      COUNT(m.id) AS milestoneCount,
      SUM(CASE WHEN m.done THEN 1 ELSE 0 END) AS doneMilestoneCount
    FROM goals g
    LEFT JOIN goal_milestones m ON m.goal_id = g.id
    WHERE g.id = ?
    GROUP BY g.id
  `).get(id) as Record<string, unknown> | undefined;
  if (!r) return null;

  const milestones = ctx.db.prepare(`
    SELECT id, goal_id AS goalId, title, due_date AS dueDate, done, created_at AS createdAt
    FROM goal_milestones
    WHERE goal_id = ?
    ORDER BY done ASC, due_date ASC NULLS LAST, title ASC
  `).all(id) as Array<Record<string, unknown>>;

  return {
    id: r.id as number,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    targetDate: (r.targetDate ?? r.target_date ?? null) as string | null,
    progressPct: Number(r.progressPct ?? r.progress_pct ?? 0),
    milestoneCount: Number(r.milestoneCount ?? 0),
    doneMilestoneCount: Number(r.doneMilestoneCount ?? r.done_milestone_count ?? 0),
    createdAt: Number(r.createdAt ?? r.created_at ?? 0),
    updatedAt: Number(r.updatedAt ?? r.updated_at ?? 0),
    milestones: milestones.map((m) => ({
      id: m.id as number,
      goalId: Number(m.goalId ?? m.goal_id ?? 0),
      title: m.title as string,
      dueDate: (m.dueDate ?? m.due_date ?? null) as string | null,
      done: Boolean(m.done),
      createdAt: Number(m.createdAt ?? m.created_at ?? 0),
    })),
  };
}

export interface CreateGoalInput {
  title: string;
  description?: string | null;
  targetDate?: string | null;
}

export function createGoal(ctx: GoalCtx, input: CreateGoalInput): GoalRow {
  if (!input.title.trim())
    throw new GoalError("invalid", "Goal title is required");
  if (input.targetDate && !DATE_RE.test(input.targetDate))
    throw new GoalError("invalid", "targetDate must be YYYY-MM-DD");

  const now = Date.now();
  const result = ctx.db.prepare(`
    INSERT INTO goals (title, description, target_date, progress_pct, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(input.title.trim(), input.description ?? null, input.targetDate ?? null, now, now);

  const id = Number(result.lastInsertRowid);
  return getGoal(ctx, id)!;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string | null;
  targetDate?: string | null;
  progressPct?: number;
}

export function updateGoal(ctx: GoalCtx, id: number, input: UpdateGoalInput): GoalRow {
  const existing = getGoal(ctx, id);
  if (!existing)
    throw new GoalError("not_found", `Goal ${id} not found`);

  const title = input.title?.trim() ?? existing.title;
  const description = input.description ?? existing.description;
  const targetDate = input.targetDate ?? existing.targetDate;
  const progressPct =
    input.progressPct !== undefined ? input.progressPct : computeProgress(existing);

  if (input.progressPct !== undefined && (input.progressPct < 0 || input.progressPct > 100))
    throw new GoalError("invalid", "progressPct must be 0-100");

  ctx.db.prepare(`
    UPDATE goals
    SET title = ?, description = ?, target_date = ?, progress_pct = ?, updated_at = ?
    WHERE id = ?
  `).run(title, description, targetDate, progressPct, Date.now(), id);

  return getGoal(ctx, id)!;
}

export function deleteGoal(ctx: GoalCtx, id: number): void {
  const existing = getGoal(ctx, id);
  if (!existing)
    throw new GoalError("not_found", `Goal ${id} not found`);
  const tx = ctx.db.transaction(() => {
    ctx.db.prepare("DELETE FROM goal_milestones WHERE goal_id = ?").run(id);
    ctx.db.prepare("DELETE FROM goals WHERE id = ?").run(id);
  });
  tx();
}

function computeProgress(goal: GoalRow): number {
  if (goal.milestoneCount === 0) return 0;
  return Math.round((goal.doneMilestoneCount / goal.milestoneCount) * 100);
}

// ------------------------------------------------------------ milestones

export function listMilestones(ctx: GoalCtx, goalId: number): MilestoneRow[] {
  const rows = ctx.db.prepare(`
    SELECT id, goal_id AS goalId, title, due_date AS dueDate, done, created_at AS createdAt
    FROM goal_milestones
    WHERE goal_id = ?
    ORDER BY done ASC, due_date ASC NULLS LAST, title ASC
  `).all(goalId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id as number,
    goalId: r.goal_id as number,
    title: r.title as string,
    dueDate: r.due_date as string | null,
    done: Boolean(r.done),
    createdAt: r.created_at as number,
  }));
}

export interface CreateMilestoneInput {
  goalId: number;
  title: string;
  dueDate?: string | null;
}

export function createMilestone(ctx: GoalCtx, input: CreateMilestoneInput): MilestoneRow {
  if (!input.title.trim())
    throw new GoalError("invalid", "Milestone title is required");
  const goal = getGoal(ctx, input.goalId);
  if (!goal)
    throw new GoalError("not_found", `Goal ${input.goalId} not found`);
  if (input.dueDate && !DATE_RE.test(input.dueDate))
    throw new GoalError("invalid", "dueDate must be YYYY-MM-DD");

  const now = Date.now();
  const result = ctx.db.prepare(`
    INSERT INTO goal_milestones (goal_id, title, due_date, done, created_at)
    VALUES (?, ?, ?, 0, ?)
  `).run(input.goalId, input.title.trim(), input.dueDate ?? null, now);

  const id = Number(result.lastInsertRowid);
  return getMilestone(ctx, input.goalId, id)!;
}

export function getMilestone(ctx: GoalCtx, goalId: number, id: number): MilestoneRow | null {
  const r = ctx.db.prepare(`
    SELECT id, goal_id AS goalId, title, due_date AS dueDate, done, created_at AS createdAt
    FROM goal_milestones
    WHERE id = ? AND goal_id = ?
  `).get(id, goalId) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: r.id as number,
    goalId: r.goal_id as number,
    title: r.title as string,
    dueDate: r.due_date as string | null,
    done: Boolean(r.done),
    createdAt: r.created_at as number,
  };
}

export interface UpdateMilestoneInput {
  title?: string;
  dueDate?: string | null;
  done?: boolean;
}

export function updateMilestone(
  ctx: GoalCtx,
  goalId: number,
  id: number,
  input: UpdateMilestoneInput,
): MilestoneRow {
  const existing = getMilestone(ctx, goalId, id);
  if (!existing)
    throw new GoalError("not_found", `Milestone ${id} not found in goal ${goalId}`);

  const title = input.title?.trim() ?? existing.title;
  const dueDate = input.dueDate ?? existing.dueDate;
  const done = input.done ?? existing.done;

  ctx.db.prepare(`
    UPDATE goal_milestones
    SET title = ?, due_date = ?, done = ?
    WHERE id = ? AND goal_id = ?
  `).run(title, dueDate, done ? 1 : 0, id, goalId);

  // Recompute goal progress
  const goal = getGoal(ctx, goalId);
  if (goal) {
    const pct = computeProgress(goal);
    ctx.db.prepare("UPDATE goals SET progress_pct = ? WHERE id = ?").run(pct, goalId);
  }

  return getMilestone(ctx, goalId, id)!;
}

export function deleteMilestone(ctx: GoalCtx, goalId: number, id: number): void {
  const existing = getMilestone(ctx, goalId, id);
  if (!existing)
    throw new GoalError("not_found", `Milestone ${id} not found in goal ${goalId}`);
  ctx.db.prepare("DELETE FROM goal_milestones WHERE id = ? AND goal_id = ?").run(id, goalId);

  // Recompute goal progress
  const goal = getGoal(ctx, goalId);
  if (goal) {
    const pct = computeProgress(goal);
    ctx.db.prepare("UPDATE goals SET progress_pct = ? WHERE id = ?").run(pct, goalId);
  }
}
