/**
 * Phryvos-K9 Complete Typed API Client
 *
 * Implements:
 * - AbortController Registry for instant stream/request cancellation
 * - Global 401 Interceptor: Immediately wipes keyring, clears react-query cache,
 *   unmounts DOM trees, and redirects to /unlock
 * - Typed methods for Auth, Chat, Files, Projects, Tasks, Goals, Exams, Calendar, Settings
 */

import { keyring } from "@/lib/keyring";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string = "API_ERROR",
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------- Abort Registry
class AbortRegistry {
  private controllers = new Map<string, AbortController>();

  public create(id: string): AbortSignal {
    this.abort(id);
    const controller = new AbortController();
    this.controllers.set(id, controller);
    return controller.signal;
  }

  public abort(id: string): void {
    const existing = this.controllers.get(id);
    if (existing) {
      existing.abort();
      this.controllers.delete(id);
    }
  }

  public abortAll(): void {
    for (const [id, controller] of this.controllers.entries()) {
      controller.abort();
    }
    this.controllers.clear();
  }
}

export const abortRegistry = new AbortRegistry();

// ---------------------------------------------------------------- Global 401 Handler
type LogoutCallback = () => void;
let onUnauthorizedHandler: LogoutCallback | null = null;

export function registerUnauthorizedHandler(handler: LogoutCallback) {
  onUnauthorizedHandler = handler;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    keyring.wipe();
    abortRegistry.abortAll();
    if (onUnauthorizedHandler) {
      onUnauthorizedHandler();
    } else if (typeof window !== "undefined" && !window.location.pathname.startsWith("/unlock")) {
      window.location.href = "/unlock";
    }
    throw new ApiError("Session expired or vault locked", 401, "UNAUTHORIZED");
  }

  const contentType = res.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");

  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`;
    let errorCode = "HTTP_ERROR";
    let details: unknown = null;

    if (isJson) {
      try {
        const errorBody = await res.json();
        errorMessage = errorBody.error?.message || errorBody.message || errorMessage;
        errorCode = errorBody.error?.code || errorBody.code || errorCode;
        details = errorBody;
      } catch {
        // Fallback to default
      }
    } else {
      const text = await res.text().catch(() => "");
      if (text) errorMessage = text;
    }

    throw new ApiError(errorMessage, res.status, errorCode, details);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return isJson ? ((await res.json()) as T) : ((await res.text()) as unknown as T);
}

// Base Fetch Function with Credentials & Default Headers
export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "same-origin",
  });

  return handleResponse<T>(res);
}

// ---------------------------------------------------------------- Auth API
export const authApi = {
  status: () => apiFetch<{ state: "locked" | "unlocked" | "setup_required"; auto_lock_minutes?: number }>("/api/auth/status"),
  setup: (password: string, duressPin?: string) =>
    apiFetch<{ ok?: boolean; success?: boolean; state: string }>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password, duressPin }),
    }),
  unlock: (password: string) =>
    apiFetch<{ ok?: boolean; success?: boolean; state: string; isDuress?: boolean; vaultType?: string }>("/api/auth/unlock", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  lock: () => {
    keyring.wipe();
    abortRegistry.abortAll();
    return apiFetch<{ success: boolean }>("/api/auth/lock", { method: "POST" });
  },
  changePassword: (oldPassword: string, newPassword: string) =>
    apiFetch<{ success: boolean }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
};

// ---------------------------------------------------------------- Chat & AI API
export const chatApi = {
  getSessions: () => apiFetch<Array<{ id: string; title: string; createdAt: number; updatedAt: number }>>("/api/chat/sessions"),
  createSession: (title?: string) =>
    apiFetch<{ id: string; title: string }>("/api/chat/sessions", {
      method: "POST",
      body: JSON.stringify({ title: title || "New Chat" }),
    }),
  deleteSession: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/chat/sessions/${id}`, { method: "DELETE" }),
  renameSession: (id: string, title: string) =>
    apiFetch<{ id: string; title: string }>(`/api/chat/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  compactSession: (id: string) =>
    apiFetch<{ success: boolean; summary?: string }>(`/api/chat/sessions/${id}/compact`, {
      method: "POST",
    }),
  getMessages: (sessionId: string) =>
    apiFetch<Array<any>>(`/api/chat/sessions/${sessionId}/messages`),
  deleteMessage: (sessionId: string, messageId: string) =>
    apiFetch<{ success: boolean }>(`/api/chat/sessions/${sessionId}/messages/${messageId}`, {
      method: "DELETE",
    }),
  getApprovals: () => apiFetch<Array<any>>("/api/chat/approvals"),
  respondApproval: (id: string, approved: boolean) =>
    apiFetch<{ success: boolean }>(`/api/chat/approvals/${id}`, {
      method: "POST",
      body: JSON.stringify({ approved }),
    }),
  getMemories: () => apiFetch<Array<{ id: string; content: string; createdAt: number }>>("/api/memories"),
  createMemory: (content: string) =>
    apiFetch<{ id: string; content: string }>("/api/memories", {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  deleteMemory: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/memories/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------- Vault / Files API
export const filesApi = {
  getFiles: (path: string = "/", trash: boolean = false) =>
    apiFetch<{ children: Array<any> }>(`/api/files?path=${encodeURIComponent(path)}${trash ? "&trash=1" : ""}`),
  getContent: (path: string) =>
    apiFetch<{ content: string; meta?: any }>(`/api/files/content?path=${encodeURIComponent(path)}`),
  saveContent: (path: string, content: string) =>
    apiFetch<{ success: boolean }>("/api/files/content", {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    }),
  createFile: (path: string, type: "file" | "dir") =>
    apiFetch<{ success: boolean }>("/api/files", {
      method: "POST",
      body: JSON.stringify({ path, type }),
    }),
  deleteFile: (path: string, permanent: boolean = false) =>
    apiFetch<{ success: boolean }>(`/api/files?path=${encodeURIComponent(path)}${permanent ? "&permanent=1" : ""}`, {
      method: "DELETE",
    }),
  moveFile: (source: string, destination: string) =>
    apiFetch<{ success: boolean }>("/api/files/move", {
      method: "POST",
      body: JSON.stringify({ source, destination }),
    }),
  search: (query: string) =>
    apiFetch<{ results: Array<any> }>(`/api/files/search?q=${encodeURIComponent(query)}`),
  getVersions: (path: string) =>
    apiFetch<{ versions: Array<any> }>(`/api/files/versions?path=${encodeURIComponent(path)}`),
  restoreVersion: (path: string, version: number) =>
    apiFetch<{ success: boolean }>("/api/files/restore", {
      method: "POST",
      body: JSON.stringify({ path, version }),
    }),
};

// ---------------------------------------------------------------- Projects & Tasks API
export const tasksApi = {
  getProjects: () => apiFetch<Array<any>>("/api/projects"),
  createProject: (data: { name: string; description?: string }) =>
    apiFetch<any>("/api/projects", { method: "POST", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  getTasks: (projectId?: string) =>
    apiFetch<Array<any>>(`/api/tasks${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`),
  createTask: (data: any) =>
    apiFetch<any>("/api/tasks", { method: "POST", body: JSON.stringify(data) }),
  updateTask: (id: string, updates: any) =>
    apiFetch<any>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deleteTask: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),
  getTaskDeps: (taskId?: string) =>
    apiFetch<Array<any>>(`/api/task-deps${taskId ? `?taskId=${encodeURIComponent(taskId)}` : ""}`),
  addTaskDep: (taskId: string, dependsOnId: string) =>
    apiFetch<{ success: boolean }>("/api/task-deps", {
      method: "POST",
      body: JSON.stringify({ taskId, dependsOnId }),
    }),
  removeTaskDep: (taskId: string, dependsOnId: string) =>
    apiFetch<{ success: boolean }>("/api/task-deps", {
      method: "DELETE",
      body: JSON.stringify({ taskId, dependsOnId }),
    }),
  logTime: (taskId: string, minutes: number, notes?: string) =>
    apiFetch<{ success: boolean }>(`/api/tasks/${taskId}/time`, {
      method: "POST",
      body: JSON.stringify({ minutes, notes }),
    }),
};

// ---------------------------------------------------------------- Goals API
export const goalsApi = {
  getGoals: () => apiFetch<Array<any>>("/api/goals"),
  createGoal: (data: { title: string; description?: string; targetDate?: string }) =>
    apiFetch<any>("/api/goals", { method: "POST", body: JSON.stringify(data) }),
  updateGoal: (id: string, data: any) =>
    apiFetch<any>(`/api/goals/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteGoal: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/goals/${id}`, { method: "DELETE" }),
  getMilestones: (goalId: string) =>
    apiFetch<Array<any>>(`/api/goals/${goalId}/milestones`),
  addMilestone: (goalId: string, title: string, dueDate?: string) =>
    apiFetch<any>(`/api/goals/${goalId}/milestones`, {
      method: "POST",
      body: JSON.stringify({ title, dueDate }),
    }),
  updateMilestone: (goalId: string, milestoneId: string, updates: any) =>
    apiFetch<any>(`/api/goals/${goalId}/milestones/${milestoneId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  deleteMilestone: (goalId: string, milestoneId: string) =>
    apiFetch<{ success: boolean }>(`/api/goals/${goalId}/milestones/${milestoneId}`, {
      method: "DELETE",
    }),
};

// ---------------------------------------------------------------- Exams / Study OS API
export const examsApi = {
  getSubjects: () => apiFetch<Array<any>>("/api/exam-subjects"),
  createSubject: (data: { name: string; examDate: string }) =>
    apiFetch<any>("/api/exam-subjects", { method: "POST", body: JSON.stringify(data) }),
  deleteSubject: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/exam-subjects/${id}`, { method: "DELETE" }),
  getTopics: (subjectId: string) =>
    apiFetch<Array<any>>(`/api/exam-subjects/${subjectId}/topics`),
  createTopic: (subjectId: string, data: { name: string; mastery?: number }) =>
    apiFetch<any>(`/api/exam-subjects/${subjectId}/topics`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTopic: (subjectId: string, topicId: string, updates: any) =>
    apiFetch<any>(`/api/exam-subjects/${subjectId}/topics`, {
      method: "PATCH",
      body: JSON.stringify({ topicId, ...updates }),
    }),
  getStudyLogs: (subjectId?: string) =>
    apiFetch<Array<any>>(`/api/study-logs${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ""}`),
  logStudy: (data: { subjectId: string; topicId?: string; durationMinutes: number; notes?: string }) =>
    apiFetch<any>("/api/study-logs", { method: "POST", body: JSON.stringify(data) }),
};

// ---------------------------------------------------------------- Calendar API
export const calendarApi = {
  getEvents: (start?: string, end?: string) =>
    apiFetch<Array<any>>(`/api/events${start ? `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end || "")}` : ""}`),
  createEvent: (data: { title: string; start: string; end?: string; description?: string }) =>
    apiFetch<any>("/api/events", { method: "POST", body: JSON.stringify(data) }),
  updateEvent: (id: string, updates: any) =>
    apiFetch<any>(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deleteEvent: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/events/${id}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------- Settings & System API
export const settingsApi = {
  getSettings: () => apiFetch<Record<string, any>>("/api/settings"),
  updateSettings: (updates: Record<string, any>) =>
    apiFetch<{ success: boolean }>("/api/settings", { method: "PATCH", body: JSON.stringify(updates) }),
  getProviders: () => apiFetch<Array<any>>("/api/providers"),
  testProvider: (id: string) =>
    apiFetch<{ success: boolean; latencyMs?: number; error?: string }>(`/api/providers/${id}/test`, {
      method: "POST",
    }),
  saveProvider: (data: any) =>
    apiFetch<any>("/api/providers", { method: "POST", body: JSON.stringify(data) }),
  deleteProvider: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/providers/${id}`, { method: "DELETE" }),
  getBackups: () => apiFetch<Array<any>>("/api/backups"),
  createBackup: () => apiFetch<{ id: string; filename: string }>("/api/backups", { method: "POST" }),
  restoreBackup: (id: string) =>
    apiFetch<{ success: boolean }>("/api/backups/restore", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
  deleteBackup: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/backups/${id}`, { method: "DELETE" }),
  exportData: () => apiFetch<Blob>("/api/export"),
};
