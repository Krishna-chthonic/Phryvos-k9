/**
 * Browser client for chat + providers (cookie auth is automatic).
 * Errors: {error:{code,message}}; locked vaults: 503 {locked:true}.
 */
import { streamSSE } from "@/lib/sse";
import type { UnifiedPart, TurnTelemetry } from "@/lib/ai/types";
export type { TurnTelemetry };

export interface ProviderMeta {
  id: number;
  name: string;
  kind: "openai" | "anthropic";
  baseUrl: string;
  models: string[];
  isDefault: boolean;
  hasKey: boolean;
}

export interface ChatSessionMeta {
  id: string;
  title: string | null;
  model: string;
  providerId: number | null;
  mode?: string | null;
  effort?: string | null;
  summaryUntil?: number;
  summary?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageDto {
  id: string;
  seq: number;
  role: "user" | "assistant" | "tool";
  content: string | UnifiedPart[];
  toolCalls: unknown[] | null;
  toolCallId: string | null;
  editedAt: number | null;
  feedback?: "helpful" | "unhelpful" | null;
  telemetry?: TurnTelemetry | null;
  createdAt: number;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { code?: string; message?: string } })
    | null;
  if (!res.ok)
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

export const chatApi = {
  listSessions: () =>
    fetch("/api/chat/sessions").then((r) => json<{ sessions: ChatSessionMeta[] }>(r)),
  createSession: (input: {
    title?: string;
    model: string;
    providerId: number | null;
    mode?: string | null;
    effort?: string | null;
  }) =>
    fetch("/api/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<{ session: ChatSessionMeta }>(r)),
  getSession: (id: string) =>
    fetch(`/api/chat/sessions/${id}`).then((r) =>
      json<{ session: ChatSessionMeta; messages: ChatMessageDto[] }>(r),
    ),
  patchSession: (
    id: string,
    patch: {
      title?: string;
      model?: string;
      providerId?: number | null;
      mode?: string | null;
      effort?: string | null;
    },
  ) =>
    fetch(`/api/chat/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => json<{ session: ChatSessionMeta }>(r)),
  deleteSession: (id: string) =>
    fetch(`/api/chat/sessions/${id}`, { method: "DELETE" }).then((r) =>
      json<{ ok: boolean }>(r),
    ),
  editMessage: (sessionId: string, messageId: string, content: string, truncate?: boolean) =>
    fetch(`/api/chat/sessions/${sessionId}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, truncate }),
    }).then((r) => json<{ messages: ChatMessageDto[] }>(r)),
  compactSession: (sessionId: string) =>
    fetch(`/api/chat/sessions/${sessionId}/compact`, {
      method: "POST",
    }).then((r) => json<{ ok: boolean; summary: string; compactedCount: number }>(r)),
  forkSession: (
    sessionId: string,
    input: { cutoffMessageId: string; title?: string },
  ) =>
    fetch(`/api/chat/sessions/${sessionId}/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) =>
      json<{ session: ChatSessionMeta; messages: ChatMessageDto[] }>(r),
    ),
  setFeedback: (
    sessionId: string,
    messageId: string,
    feedback: "helpful" | "unhelpful" | null,
  ) =>
    fetch(`/api/chat/sessions/${sessionId}/messages/${messageId}/feedback`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    }).then((r) => json<{ ok: boolean; feedback: "helpful" | "unhelpful" | null }>(r)),

  sendMessage(
    sessionId: string,
    body: {
      content?: string | UnifiedPart[];
      model?: string;
      regenerate?: boolean;
      effort?: "low" | "medium" | "high" | "max" | "xhigh" | "ultra";
      mode?: "thinking" | "flash" | "research" | "coding" | "creative" | "study" | "general";
    },
    onEvent: (event: string, data: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    return (async () => {
      for await (const ev of streamSSE(
        `/api/chat/sessions/${sessionId}/messages`,
        body,
        signal,
      ))
        onEvent(ev.event, ev.data);
    })();
  },
};

export const providersApi = {
  list: () => fetch("/api/providers").then((r) => json<{ providers: ProviderMeta[] }>(r)),
  create: (input: {
    name: string;
    kind: "openai" | "anthropic";
    baseUrl: string;
    apiKey?: string;
    models?: string[];
    isDefault?: boolean;
  }) =>
    fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<{ provider: ProviderMeta }>(r)),
  patch: (
    id: number,
    input: {
      name?: string;
      kind?: "openai" | "anthropic";
      baseUrl?: string;
      apiKey?: string;
      models?: string[];
      isDefault?: boolean;
    },
  ) =>
    fetch(`/api/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<{ provider: ProviderMeta }>(r)),
  remove: (id: number) =>
    fetch(`/api/providers/${id}`, { method: "DELETE" }).then((r) =>
      json<{ ok: boolean }>(r),
    ),
  test: (id: number, model?: string) =>
    fetch(`/api/providers/${id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(model ? { model } : {}),
    }).then((r) => r.json()),
};

export interface PendingApprovalDto {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  description: string;
  createdAt: number;
  state: "pending" | "allowed" | "denied" | "auto_denied";
}

export const approvalsApi = {
  /** Resolve a waiting destructive-tool approval. */
  resolve: (id: string, decision: "allow" | "deny") =>
    fetch(`/api/chat/approvals/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    }).then((r) => json<{ ok: boolean }>(r)),
  pending: () =>
    fetch("/api/chat/approvals").then((r) => json<{ pending: PendingApprovalDto[] }>(r)),
};

export const settingsApi = {
  getSystemPrompt: () =>
    fetch("/api/settings").then((r) => json<{ systemPrompt: string | null }>(r)),
  setSystemPrompt: (systemPrompt: string) =>
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt }),
    }).then((r) => json<{ ok: boolean }>(r)),
};
