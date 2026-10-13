/**
 * P5: typed client for the tracking API (projects, tasks, deps, time).
 * Mirrors `lib/api.ts` style — plain fetch + json helper, throws `ApiError`.
 */
import type { ProjectRow, TaskRow, TimeEntryRow } from "@/lib/tracking-service";

export interface SearchHit {
  path: string;
  name: string;
  isDir: boolean;
  snippet: string | null;
}

export interface VersionInfo {
  version: number;
  note: string | null;
  createdAt: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as T & {
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
  } | null;
  if (!res.ok) {
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    const code = body?.error?.code ?? "http";
    const details = body?.error?.details;
    throw new ApiError(msg, res.status, code, details);
  }
  return body as T;
}

export const trackingApi = {
  // Projects
  listProjects: (includeArchived?: boolean) =>
    fetch(`/api/projects${includeArchived ? "?archived=1" : ""}`).then((r) =>
      json<{ projects: ProjectRow[] }>(r),
    ),
  getProject: (id: number) =>
    fetch(`/api/projects/${id}`).then((r) => json<{ project: ProjectRow }>(r)),
  createProject: (input: {
    title: string;
    description?: string | null;
    color?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }) =>
    fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<{ project: ProjectRow }>(r)),
  updateProject: (id: number, patch: Partial<ProjectRow>) =>
    fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => json<{ project: ProjectRow }>(r)),
  deleteProject: (id: number) =>
    fetch(`/api/projects/${id}`, { method: "DELETE" }).then((r) =>
      json<{ ok: boolean }>(r),
    ),

  // Tasks
  listTasks: (opts?: { projectId?: number; status?: TaskRow["status"]; limit?: number }) => {
    const sp = new URLSearchParams();
    if (opts?.projectId) sp.set("projectId", String(opts.projectId));
    if (opts?.status) sp.set("status", opts.status);
    if (opts?.limit) sp.set("limit", String(opts.limit));
    return fetch(`/api/tasks?${sp.toString()}`).then((r) =>
      json<{ tasks: TaskRow[] }>(r),
    );
  },
  getTask: (id: number) =>
    fetch(`/api/tasks/${id}`).then((r) =>
      json<{ task: TaskRow; deps: { blockers: TaskRow[]; blocked: TaskRow[] }; blockers: TaskRow[] }>(r),
    ),
  createTask: (input: {
    projectId?: number | null;
    title: string;
    description?: string | null;
    status?: TaskRow["status"];
    priority?: number;
    dueDate?: string | null;
    startDate?: string | null;
    tags?: string[];
  }) =>
    fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<{ task: TaskRow }>(r)),
  updateTask: (id: number, patch: Partial<TaskRow>) =>
    fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => json<{ task: TaskRow }>(r)),
  deleteTask: (id: number) =>
    fetch(`/api/tasks/${id}`, { method: "DELETE" }).then((r) =>
      json<{ ok: boolean }>(r),
    ),

  // Task dependencies
  getTaskDeps: (taskId: number) =>
    fetch(`/api/tasks/${taskId}/deps`).then((r) =>
      json<{ deps: { blockers: TaskRow[]; blocked: TaskRow[] } }>(r),
    ),
  listTaskDeps: (limit?: number) =>
    fetch(`/api/task-deps?limit=${limit ?? 500}`).then((r) =>
      json<{ deps: { taskId: number; blocksTaskId: number }[] }>(r),
    ),
  addTaskDep: (taskId: number, blocksTaskId: number) =>
    fetch(`/api/tasks/${taskId}/deps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocksTaskId }),
    }).then((r) => json<{ ok: boolean }>(r)),
  removeTaskDep: (taskId: number, blocksTaskId: number) =>
    fetch(`/api/tasks/${taskId}/deps`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocksTaskId }),
    }).then((r) => json<{ ok: boolean }>(r)),

  // Time entries
  listTimeEntries: (opts: { taskId?: number; projectId?: number; limit?: number } = {}) => {
    const sp = new URLSearchParams();
    if (opts.taskId) sp.set("taskId", String(opts.taskId));
    if (opts.projectId) sp.set("projectId", String(opts.projectId));
    if (opts.limit) sp.set("limit", String(opts.limit));
    return fetch(`/api/tasks/${opts.taskId}/time?${sp.toString()}`).then((r) =>
      json<{ entries: TimeEntryRow[] }>(r),
    );
  },
  addTimeEntry: (taskId: number, input: {
    taskId?: number | null;
    projectId?: number | null;
    startedAt?: number;
    durationSec: number;
    note?: string | null;
  }) =>
    fetch(`/api/tasks/${taskId}/time`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, taskId: input.taskId ?? taskId }),
    }).then((r) => json<{ entry: TimeEntryRow }>(r)),
  deleteTimeEntry: (taskId: number, id: number, scopeTaskId?: number) =>
    fetch(`/api/tasks/${taskId}/time`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, taskId: scopeTaskId }),
    }).then((r) => json<{ ok: boolean }>(r)),
};