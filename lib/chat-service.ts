/**
 * Chat persistence and context assembly service for phryvos-k9.
 *
 * Importers/callers: app/api/chat/sessions/route.ts
 * Affected API: Chat message streaming and session endpoints
 * Data schemas if any: chat_sessions, chat_messages, memories
 * User instruction verbatim: "3. ek memmory system bhi hona chahiye ai ke liye jisme vo points bana ke chijo ko permanentlt yaad rakhe jinko users khud se kahe ki ye chij yaad rakhna ya permanently save kar lo"
 */
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { encryptBlob, gcmDecrypt } from "@/lib/crypto/envelope";
import type { UnifiedMessage, UnifiedPart, ToolCall } from "@/lib/ai/types";

/**
 * Chat persistence: encrypted at rest (content, titles, summaries under the
 * vault master key), seq-ordered per session, soft-deleted for
 * edit/regenerate. P4's agent loop appends tool messages through the same
 * appendMessage().
 */

export interface VaultCtx {
  db: Database.Database;
  key: Buffer;
}

export interface ChatSessionMeta {
  id: string;
  title: string | null;
  model: string;
  providerId: number | null;
  summaryUntil: number;
  summary?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageDto {
  id: string;
  seq: number;
  role: "user" | "assistant" | "tool";
  content: string | UnifiedPart[];
  toolCalls: ToolCall[] | null;
  toolCallId: string | null;
  editedAt: number | null;
  createdAt: number;
}

interface SessionRow {
  id: string;
  title_enc: Buffer | null;
  title_nonce: Buffer | null;
  title_tag: Buffer | null;
  provider_id: number | null;
  model: string;
  summary_enc: Buffer | null;
  summary_nonce: Buffer | null;
  summary_tag: Buffer | null;
  summary_until: number;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  session_id: string;
  seq: number;
  role: "user" | "assistant" | "tool";
  content_enc: Buffer | null;
  content_nonce: Buffer | null;
  content_tag: Buffer | null;
  tool_calls: string | null;
  tool_call_id: string | null;
  edited_at: number | null;
  deleted: number;
  created_at: number;
}

function decryptTitle(ctx: VaultCtx, r: SessionRow): string | null {
  if (!r.title_enc || !r.title_nonce || !r.title_tag) return null;
  try {
    return gcmDecrypt(ctx.key, {
      enc: r.title_enc,
      nonce: r.title_nonce,
      tag: r.title_tag,
    }).toString("utf8");
  } catch {
    return null;
  }
}

function decryptContent(ctx: VaultCtx, r: MessageRow): string | UnifiedPart[] {
  if (!r.content_enc || !r.content_nonce || !r.content_tag) return "";
  let s: string;
  try {
    s = gcmDecrypt(ctx.key, {
      enc: r.content_enc,
      nonce: r.content_nonce,
      tag: r.content_tag,
    }).toString("utf8");
  } catch {
    return "";
  }
  // images ride as JSON-encoded parts
  if (s.startsWith("[{")) {
    try {
      const v = JSON.parse(s);
      if (Array.isArray(v)) return v as UnifiedPart[];
    } catch {
      /* plain text */
    }
  }
  return s;
}

function contentToStore(content: string | UnifiedPart[]): string {
  if (typeof content === "string") return content;
  return JSON.stringify(content);
}

function parseToolCalls(raw: string | null): ToolCall[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as ToolCall[]) : null;
  } catch {
    return null;
  }
}

function toMeta(ctx: VaultCtx, r: SessionRow): ChatSessionMeta {
  let summary: string | null = null;
  if (r.summary_enc && r.summary_nonce && r.summary_tag) {
    try {
      summary = gcmDecrypt(ctx.key, {
        enc: r.summary_enc,
        nonce: r.summary_nonce,
        tag: r.summary_tag,
      }).toString("utf8");
    } catch {
      summary = null;
    }
  }
  return {
    id: r.id,
    title: decryptTitle(ctx, r),
    model: r.model,
    providerId: r.provider_id,
    summaryUntil: r.summary_until,
    summary,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function sessionRow(ctx: VaultCtx, id: string): SessionRow | undefined {
  return ctx.db
    .prepare("SELECT * FROM chat_sessions WHERE id = ?")
    .get(id) as SessionRow | undefined;
}

// ------------------------------------------------------------ sessions

export function createSession(
  ctx: VaultCtx,
  input: { title?: string; model: string; providerId: number | null },
): ChatSessionMeta {
  const id = randomUUID();
  const now = Date.now();
  const titleBlob = input.title?.trim()
    ? encryptBlob(ctx.key, input.title.trim())
    : null;
  ctx.db
    .prepare(
      `INSERT INTO chat_sessions (id, title_enc, title_nonce, title_tag, provider_id, model, summary_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      id,
      titleBlob?.enc ?? null,
      titleBlob?.nonce ?? null,
      titleBlob?.tag ?? null,
      input.providerId,
      input.model,
      now,
      now,
    );
  return toMeta(ctx, sessionRow(ctx, id)!);
}

export function listSessions(ctx: VaultCtx): ChatSessionMeta[] {
  const rows = ctx.db
    .prepare("SELECT * FROM chat_sessions ORDER BY updated_at DESC")
    .all() as SessionRow[];
  return rows.map((r) => toMeta(ctx, r));
}

export function getSession(ctx: VaultCtx, id: string): ChatSessionMeta {
  const r = sessionRow(ctx, id);
  if (!r) throw new Error(`Session not found: ${id}`);
  return toMeta(ctx, r);
}

export function deleteSession(ctx: VaultCtx, id: string): void {
  const r = sessionRow(ctx, id);
  if (!r) throw new Error(`Session not found: ${id}`);
  ctx.db.transaction(() => {
    ctx.db.prepare("DELETE FROM chat_messages WHERE session_id = ?").run(id);
    ctx.db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id);
  })();
}

export function renameSession(ctx: VaultCtx, id: string, title: string): void {
  const r = sessionRow(ctx, id);
  if (!r) throw new Error(`Session not found: ${id}`);
  const t = title.trim() ? encryptBlob(ctx.key, title.trim()) : null;
  ctx.db
    .prepare(
      "UPDATE chat_sessions SET title_enc = ?, title_nonce = ?, title_tag = ?, updated_at = ? WHERE id = ?",
    )
    .run(t?.enc ?? null, t?.nonce ?? null, t?.tag ?? null, Date.now(), id);
}

// ------------------------------------------------------------ messages

function maxSeq(ctx: VaultCtx, sessionId: string): number {
  const r = ctx.db
    .prepare("SELECT MAX(seq) AS m FROM chat_messages WHERE session_id = ?")
    .get(sessionId) as { m: number | null };
  return r.m ?? -1;
}

export interface AppendInput {
  role: "user" | "assistant" | "tool";
  content: string | UnifiedPart[];
  toolCalls?: ToolCall[] | null;
  toolCallId?: string | null;
}

export function appendMessage(
  ctx: VaultCtx,
  sessionId: string,
  input: AppendInput,
): ChatMessageDto {
  const r0 = sessionRow(ctx, sessionId);
  if (!r0) throw new Error(`Session not found: ${sessionId}`);
  const seq = maxSeq(ctx, sessionId) + 1;
  const id = randomUUID();
  const now = Date.now();
  const blob = encryptBlob(ctx.key, contentToStore(input.content));
  ctx.db
    .prepare(
      `INSERT INTO chat_messages (id, session_id, seq, role, content_enc, content_nonce, content_tag, tool_calls, tool_call_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      sessionId,
      seq,
      input.role,
      blob.enc,
      blob.nonce,
      blob.tag,
      input.toolCalls?.length ? JSON.stringify(input.toolCalls) : null,
      input.toolCallId ?? null,
      now,
    );
  ctx.db.prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?").run(now, sessionId);
  // auto-title: first user message seeds the title if still empty
  // (seq is MAX(seq)+1 over all rows — empty session ⇒ seq 0, so guard on the
  // title column, not the sequence number)
  if (input.role === "user" && !r0.title_enc) {
    const text =
      typeof input.content === "string"
        ? input.content
        : contentToStore(input.content);
    const title = text.slice(0, 60).replace(/\n/g, " ");
    const tb = encryptBlob(ctx.key, title);
    ctx.db
      .prepare(
        "UPDATE chat_sessions SET title_enc = ?, title_nonce = ?, title_tag = ? WHERE id = ? AND title_enc IS NULL",
      )
      .run(tb.enc, tb.nonce, tb.tag, sessionId);
  }
  const row = ctx.db
    .prepare("SELECT * FROM chat_messages WHERE id = ?")
    .get(id) as MessageRow;
  return {
    id: row.id,
    seq: row.seq,
    role: row.role,
    content: decryptContent(ctx, row),
    toolCalls: parseToolCalls(row.tool_calls),
    toolCallId: row.tool_call_id,
    editedAt: row.edited_at,
    createdAt: row.created_at,
  };
}

export function listMessages(ctx: VaultCtx, sessionId: string): ChatMessageDto[] {
  if (!sessionRow(ctx, sessionId)) throw new Error(`Session not found: ${sessionId}`);
  const rows = ctx.db
    .prepare("SELECT * FROM chat_messages WHERE session_id = ? AND deleted = 0 ORDER BY seq")
    .all(sessionId) as MessageRow[];
  return rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    role: r.role,
    content: decryptContent(ctx, r),
    toolCalls: parseToolCalls(r.tool_calls),
    toolCallId: r.tool_call_id,
    editedAt: r.edited_at,
    createdAt: r.created_at,
  }));
}

/**
 * Edit a user message: replace content, soft-delete everything after it,
 * and reset the stored summary (context changed under it).
 */
export function editUserMessage(
  ctx: VaultCtx,
  sessionId: string,
  messageId: string,
  content: string,
): void {
  if (!sessionRow(ctx, sessionId)) throw new Error(`Session not found: ${sessionId}`);
  const row = ctx.db
    .prepare("SELECT * FROM chat_messages WHERE id = ? AND session_id = ?")
    .get(messageId, sessionId) as MessageRow | undefined;
  if (!row) throw new Error(`Message not found: ${messageId}`);
  const tx = ctx.db.transaction(() => {
    const blob = encryptBlob(ctx.key, content);
    ctx.db
      .prepare(
        "UPDATE chat_messages SET content_enc = ?, content_nonce = ?, content_tag = ?, edited_at = ? WHERE id = ?",
      )
      .run(blob.enc, blob.nonce, blob.tag, Date.now(), messageId);
    ctx.db
      .prepare("UPDATE chat_messages SET deleted = 1 WHERE session_id = ? AND seq > ?")
      .run(sessionId, row.seq);
    ctx.db
      .prepare(
        "UPDATE chat_sessions SET summary_enc = NULL, summary_nonce = NULL, summary_tag = NULL, summary_until = 0, updated_at = ? WHERE id = ?",
      )
      .run(Date.now(), sessionId);
  });
  tx();
}

/**
 * Regenerate: soft-delete from the last assistant turn onwards.
 * Returns the seq of that assistant message (caller re-prompts from the
 * previous user message).
 */
export function regenerate(ctx: VaultCtx, sessionId: string): number {
  if (!sessionRow(ctx, sessionId)) throw new Error(`Session not found: ${sessionId}`);
  const last = ctx.db
    .prepare(
      "SELECT seq FROM chat_messages WHERE session_id = ? AND deleted = 0 AND role = 'assistant' ORDER BY seq DESC LIMIT 1",
    )
    .get(sessionId) as { seq: number } | undefined;
  const from = last ? last.seq : maxSeq(ctx, sessionId) + 1;
  ctx.db
    .prepare("UPDATE chat_messages SET deleted = 1 WHERE session_id = ? AND seq >= ?")
    .run(sessionId, from);
  return from;
}

// ------------------------------------------------------------ context + summary

/** Build the LLM-visible context: global prompt → stored summary → messages after it. */
export function buildContext(
  ctx: VaultCtx,
  sessionId: string,
  globalPrompt: string | null,
): { messages: UnifiedMessage[]; summary: string | null; since: number } {
  const s = sessionRow(ctx, sessionId);
  if (!s) throw new Error(`Session not found: ${sessionId}`);
  let summary: string | null = null;
  if (s.summary_enc && s.summary_nonce && s.summary_tag) {
    try {
      summary = gcmDecrypt(ctx.key, {
        enc: s.summary_enc,
        nonce: s.summary_nonce,
        tag: s.summary_tag,
      }).toString("utf8");
    } catch {
      summary = null;
    }
  }
  const since = summary ? s.summary_until : 0;
  const rows = ctx.db
    .prepare(
      "SELECT * FROM chat_messages WHERE session_id = ? AND deleted = 0 AND seq > ? ORDER BY seq",
    )
    .all(sessionId, since) as MessageRow[];
  const messages: UnifiedMessage[] = [];
  if (globalPrompt?.trim())
    messages.push({ role: "system", content: globalPrompt.trim() });

  // Inject permanent memories if any exist
  try {
    const memRows = ctx.db
      .prepare("SELECT id, point FROM memories ORDER BY created_at ASC")
      .all() as Array<{ id: number; point: string }>;
    if (memRows.length > 0) {
      const memoryLines = memRows.map((m) => `- [Memory #${m.id}] ${m.point}`).join("\n");
      messages.push({
        role: "system",
        content: `<permanent_user_memories>\nThe user has explicitly asked you to remember the following facts permanently:\n${memoryLines}\n\nUse these memories naturally when relevant. Do not contradict them.\n</permanent_user_memories>`,
      });
    }
  } catch {
    // memories table might not exist in mock/isolated tests
  }

  // Guidelines for mathematics, LaTeX, and numerical simplification
  messages.push({
    role: "system",
    content: `<mathematics_and_numerical_guidelines>
When answering mathematics, physics, science, or calculation questions:
1. Simplify numerical values explicitly: do not stop at an abstract unsimplified formula like "x = (45*1.2)/sin(30)". Compute the final simplified numerical answer clearly (e.g., "x = 108").
2. Present step-by-step arithmetic transitions and show the substituted values.
3. Use LaTeX math formatting with $...$ for inline formulas and $$...$$ for block formulas.
4. Bold and clearly label the final numerical result with appropriate units (e.g. "**Final Result: 54.2 m/s**").
5. When complex arithmetic is required, use the \`calculate\` tool to guarantee calculation precision without arithmetic errors.
</mathematics_and_numerical_guidelines>`,
  });

  if (summary)
    messages.push({
      role: "system",
      content: `Earlier in this conversation (summarized):\n${summary}`,
    });
  for (const r of rows) {
    messages.push({
      role: r.role,
      content: decryptContent(ctx, r),
      toolCalls: parseToolCalls(r.tool_calls) ?? undefined,
      toolCallId: r.tool_call_id ?? undefined,
    });
  }
  return { messages, summary, since };
}

export function storeSummary(
  ctx: VaultCtx,
  sessionId: string,
  summary: string,
  untilSeq: number,
): void {
  const s = sessionRow(ctx, sessionId);
  if (!s) throw new Error(`Session not found: ${sessionId}`);
  const blob = encryptBlob(ctx.key, summary);
  ctx.db
    .prepare(
      "UPDATE chat_sessions SET summary_enc = ?, summary_nonce = ?, summary_tag = ?, summary_until = ?, updated_at = ? WHERE id = ?",
    )
    .run(blob.enc, blob.nonce, blob.tag, untilSeq, Date.now(), sessionId);
}
