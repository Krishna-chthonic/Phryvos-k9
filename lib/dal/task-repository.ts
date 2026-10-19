import type Database from "better-sqlite3";
import type { TaskRow, ProjectRow, TaskStatus } from "../domain/tracking";

export interface TaskRepository {
  listTasks(db: Database.Database, opts?: { projectId?: number; status?: TaskStatus }): TaskRow[];
  getTask(db: Database.Database, id: number): TaskRow | null;
  saveTask(db: Database.Database, task: Partial<TaskRow> & { title: string }): TaskRow;
  deleteTask(db: Database.Database, id: number): boolean;
  listProjects(db: Database.Database, includeArchived?: boolean): ProjectRow[];
}

export class SqliteTaskRepository implements TaskRepository {
  public listTasks(
    db: Database.Database,
    opts: { projectId?: number; status?: TaskStatus } = {},
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

    const sql = `
      SELECT t.id, t.project_id AS projectId, p.title AS projectTitle, t.title, t.description,
             t.status, t.priority, t.due_date AS dueDate, t.start_date AS startDate,
             t.tags, t.completed_at AS completedAt, t.created_at AS createdAt, t.updated_at AS updatedAt
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY t.priority DESC, t.due_date IS NULL, t.due_date, t.id
    `;

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.mapTask(r));
  }

  public getTask(db: Database.Database, id: number): TaskRow | null {
    const r = db.prepare(`
      SELECT t.id, t.project_id AS projectId, p.title AS projectTitle, t.title, t.description,
             t.status, t.priority, t.due_date AS dueDate, t.start_date AS startDate,
             t.tags, t.completed_at AS completedAt, t.created_at AS createdAt, t.updated_at AS updatedAt
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.id = ?
    `).get(id) as Record<string, unknown> | undefined;

    return r ? this.mapTask(r) : null;
  }

  public saveTask(
    db: Database.Database,
    input: Partial<TaskRow> & { title: string },
  ): TaskRow {
    const now = Date.now();
    const status = input.status ?? "todo";
    const priority = input.priority ?? 1;
    const completedAt = status === "done" ? now : null;

    if (input.id) {
      db.prepare(`
        UPDATE tasks
        SET title = ?, description = ?, status = ?, priority = ?,
            due_date = ?, start_date = ?, tags = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.title.trim(),
        input.description ?? null,
        status,
        priority,
        input.dueDate ?? null,
        input.startDate ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
        completedAt,
        now,
        input.id,
      );
      return this.getTask(db, input.id)!;
    }

    const res = db.prepare(`
      INSERT INTO tasks (
        project_id, title, description, status, priority,
        due_date, start_date, tags, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.projectId ?? null,
      input.title.trim(),
      input.description ?? null,
      status,
      priority,
      input.dueDate ?? null,
      input.startDate ?? null,
      input.tags ? JSON.stringify(input.tags) : null,
      completedAt,
      now,
      now,
    );

    return this.getTask(db, Number(res.lastInsertRowid))!;
  }

  public deleteTask(db: Database.Database, id: number): boolean {
    const res = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return res.changes > 0;
  }

  public listProjects(db: Database.Database, includeArchived = false): ProjectRow[] {
    const where = includeArchived ? "" : "WHERE status = 'active'";
    const rows = db.prepare(`
      SELECT id, title, description, color, status, start_date AS startDate, end_date AS endDate,
             created_at AS createdAt, updated_at AS updatedAt,
             (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS taskCount,
             (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS doneCount
      FROM projects p
      ${where}
      ORDER BY updated_at DESC
    `).all() as Record<string, unknown>[];

    return rows.map((r) => ({
      id: r.id as number,
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      color: (r.color as string | null) ?? null,
      status: r.status as ProjectRow["status"],
      startDate: (r.startDate as string | null) ?? null,
      endDate: (r.endDate as string | null) ?? null,
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
      taskCount: Number(r.taskCount ?? 0),
      doneCount: Number(r.doneCount ?? 0),
    }));
  }

  private mapTask(r: Record<string, unknown>): TaskRow {
    let tags: string[] = [];
    try {
      if (typeof r.tags === "string") tags = JSON.parse(r.tags);
    } catch {}

    return {
      id: r.id as number,
      projectId: (r.projectId as number | null) ?? null,
      projectTitle: (r.projectTitle as string | null) ?? null,
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      status: r.status as TaskRow["status"],
      priority: Number(r.priority ?? 1) as TaskRow["priority"],
      dueDate: (r.dueDate as string | null) ?? null,
      startDate: (r.startDate as string | null) ?? null,
      tags,
      completedAt: r.completedAt != null ? Number(r.completedAt) : null,
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    };
  }
}

export const taskRepo = new SqliteTaskRepository();
