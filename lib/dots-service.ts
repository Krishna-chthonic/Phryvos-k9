import type { VaultCtx } from "@/lib/providers-service";
import type Database from "better-sqlite3";
import crypto from "node:crypto";

export interface DotDto {
  id: string;
  name: string;
  character: "blue" | "mint" | "orange" | "purple";
  role: string;
  description?: string | null;
  systemPrompt: string;
  model: string;
  tools: string[];
  status: "idle" | "working" | "paused" | "complete" | "needs-input";
  workingDirectory: string;
  createdAt: number;
  updatedAt: number;
}

export interface DotToolCall {
  id: string;
  type?: string;
  function?: {
    name: string;
    arguments: string;
  };
  name?: string;
  args?: Record<string, unknown>;
}

export interface DotMessageDto {
  id: string;
  dotId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: DotToolCall[] | null;
  toolCallId?: string | null;
  toolName?: string | null;
  toolArgs?: string | null;
  toolResult?: string | null;
  status?: string | null;
  createdAt: number;
}

export interface DotSpaceDto {
  id: string;
  dotId: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface DotTaskDto {
  id: string;
  dotId: string;
  prompt: string;
  status: "queued" | "running" | "completed" | "failed" | "paused";
  intervalSeconds: number | null;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastResult: string | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateDotInput {
  name: string;
  character?: "blue" | "mint" | "orange" | "purple";
  role: string;
  description?: string;
  systemPrompt: string;
  model?: string;
  tools?: string[];
  workingDirectory?: string;
}

interface RawDotRow {
  id: string;
  name: string;
  character: string;
  role: string;
  description: string | null;
  system_prompt: string;
  model: string | null;
  tools: string;
  status: string;
  working_directory: string | null;
  created_at: number;
  updated_at: number;
}

interface RawDotMessageRow {
  id: string;
  dot_id: string;
  role: string;
  content: string;
  tool_calls: string | null;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_args: string | null;
  tool_result: string | null;
  status: string | null;
  created_at: number;
}

interface RawDotSpaceRow {
  id: string;
  dot_id: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
}

function mapDot(r: RawDotRow): DotDto {
  return {
    id: r.id,
    name: r.name,
    character: (r.character as DotDto["character"]) || "blue",
    role: r.role,
    description: r.description,
    systemPrompt: r.system_prompt,
    model: r.model || "auto",
    tools: safeParseJson(r.tools, ["terminal", "vault", "web_search", "web_fetch"]),
    status: (r.status as DotDto["status"]) || "idle",
    workingDirectory: r.working_directory || "/workspace",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * List all active Dots.
 */
export function listDots(ctx: VaultCtx): DotDto[] {
  const stmt = ctx.db.prepare("SELECT * FROM dots ORDER BY created_at ASC");
  const rows = stmt.all() as RawDotRow[];
  return rows.map(mapDot);
}

/**
 * Get single Dot details.
 */
export function getDot(ctx: VaultCtx, id: string): DotDto | null {
  const stmt = ctx.db.prepare("SELECT * FROM dots WHERE id = ?");
  const row = stmt.get(id) as RawDotRow | undefined;
  if (!row) return null;
  return mapDot(row);
}

/**
 * Create a new custom specialist Dot.
 */
export function createDot(ctx: VaultCtx, input: CreateDotInput): DotDto {
  const id = `dot_${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();
  const character = input.character || "blue";
  const model = input.model || "auto";
  const tools = JSON.stringify(input.tools || ["terminal", "vault", "web_search", "web_fetch"]);
  const workingDir = input.workingDirectory || `/workspace/${input.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  const stmt = ctx.db.prepare(`
    INSERT INTO dots (id, name, character, role, description, system_prompt, model, tools, status, working_directory, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    input.name.trim(),
    character,
    input.role.trim(),
    input.description?.trim() || "",
    input.systemPrompt.trim(),
    model,
    tools,
    "idle",
    workingDir,
    now,
    now
  );

  return {
    id,
    name: input.name.trim(),
    character,
    role: input.role.trim(),
    description: input.description?.trim() || "",
    systemPrompt: input.systemPrompt.trim(),
    model,
    tools: input.tools || ["terminal", "vault", "web_search", "web_fetch"],
    status: "idle",
    workingDirectory: workingDir,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update a Dot.
 */
export function updateDot(ctx: VaultCtx, id: string, updates: Partial<DotDto>): DotDto {
  const existing = getDot(ctx, id);
  if (!existing) throw new Error(`Dot ${id} not found`);

  const now = Date.now();
  const name = updates.name !== undefined ? updates.name.trim() : existing.name;
  const character = updates.character !== undefined ? updates.character : existing.character;
  const role = updates.role !== undefined ? updates.role.trim() : existing.role;
  const description = updates.description !== undefined ? updates.description?.trim() : existing.description;
  const systemPrompt = updates.systemPrompt !== undefined ? updates.systemPrompt.trim() : existing.systemPrompt;
  const model = updates.model !== undefined ? updates.model : existing.model;
  const tools = updates.tools !== undefined ? JSON.stringify(updates.tools) : JSON.stringify(existing.tools);
  const status = updates.status !== undefined ? updates.status : existing.status;
  const workingDir = updates.workingDirectory !== undefined ? updates.workingDirectory : existing.workingDirectory;

  const stmt = ctx.db.prepare(`
    UPDATE dots
    SET name = ?, character = ?, role = ?, description = ?, system_prompt = ?, model = ?, tools = ?, status = ?, working_directory = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(name, character, role, description || "", systemPrompt, model, tools, status, workingDir, now, id);

  const refreshed = getDot(ctx, id);
  if (!refreshed) throw new Error(`Failed to refresh dot ${id}`);
  return refreshed;
}

/**
 * Delete a Dot.
 */
export function deleteDot(ctx: VaultCtx, id: string): boolean {
  ctx.db.prepare("DELETE FROM dots WHERE id = ?").run(id);
  ctx.db.prepare("DELETE FROM dot_messages WHERE dot_id = ?").run(id);
  ctx.db.prepare("DELETE FROM dot_spaces WHERE dot_id = ?").run(id);
  ctx.db.prepare("DELETE FROM dot_tasks WHERE dot_id = ?").run(id);
  return true;
}

/**
 * List messages for a Dot with canonical tool-call history.
 */
export function listDotMessages(ctx: VaultCtx, dotId: string): DotMessageDto[] {
  const stmt = ctx.db.prepare("SELECT * FROM dot_messages WHERE dot_id = ? ORDER BY created_at ASC");
  const rows = stmt.all(dotId) as RawDotMessageRow[];

  return rows.map((r) => ({
    id: r.id,
    dotId: r.dot_id,
    role: r.role as DotMessageDto["role"],
    content: r.content,
    toolCalls: safeParseJson<DotToolCall[] | null>(r.tool_calls, null),
    toolCallId: r.tool_call_id,
    toolName: r.tool_name,
    toolArgs: r.tool_args,
    toolResult: r.tool_result,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/**
 * Append message to a Dot's conversation with canonical tool call linkage.
 */
export function appendDotMessage(
  ctx: VaultCtx,
  dotId: string,
  msg: {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    toolCalls?: DotToolCall[] | null;
    toolCallId?: string | null;
    toolName?: string | null;
    toolArgs?: string | null;
    toolResult?: string | null;
    status?: string;
  }
): DotMessageDto {
  const id = `msg_${crypto.randomUUID()}`;
  const now = Date.now();
  const toolCallsJson = msg.toolCalls ? JSON.stringify(msg.toolCalls) : null;

  const stmt = ctx.db.prepare(`
    INSERT INTO dot_messages (id, dot_id, role, content, tool_calls, tool_call_id, tool_name, tool_args, tool_result, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    dotId,
    msg.role,
    msg.content,
    toolCallsJson,
    msg.toolCallId || null,
    msg.toolName || null,
    msg.toolArgs || null,
    msg.toolResult || null,
    msg.status || "done",
    now
  );

  return {
    id,
    dotId,
    role: msg.role,
    content: msg.content,
    toolCalls: msg.toolCalls ?? null,
    toolCallId: msg.toolCallId ?? null,
    toolName: msg.toolName || null,
    toolArgs: msg.toolArgs || null,
    toolResult: msg.toolResult || null,
    status: msg.status || "done",
    createdAt: now,
  };
}

/**
 * Format Dot Spaces documents into system prompt knowledge base context.
 */
export function formatSpacesContext(spaces: DotSpaceDto[]): string {
  if (!spaces || spaces.length === 0) return "";
  const header = "\n\n# Active Dot Spaces Knowledge Base\n";
  const docs = spaces
    .map((s) => `### ${s.title}\n${s.content}`)
    .join("\n\n");
  return `${header}${docs}\n`;
}

/**
 * List Spaces/Pages for a Dot.
 */
export function listDotSpaces(ctx: VaultCtx, dotId: string): DotSpaceDto[] {
  const stmt = ctx.db.prepare("SELECT * FROM dot_spaces WHERE dot_id = ? ORDER BY updated_at DESC");
  const rows = stmt.all(dotId) as RawDotSpaceRow[];

  return rows.map((r) => ({
    id: r.id,
    dotId: r.dot_id,
    title: r.title,
    content: r.content,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Save or update a Dot Space (Document Page).
 */
export function saveDotSpace(
  ctx: VaultCtx,
  dotId: string,
  space: { id?: string; title: string; content: string }
): DotSpaceDto {
  const now = Date.now();
  const id = space.id || `space_${crypto.randomUUID().slice(0, 8)}`;

  const existing = ctx.db.prepare("SELECT * FROM dot_spaces WHERE id = ?").get(id) as RawDotSpaceRow | undefined;
  if (existing) {
    if (existing.dot_id !== dotId) {
      throw new Error(`Forbidden: Space "${id}" belongs to another Dot ("${existing.dot_id}"), ownership check failed.`);
    }
    ctx.db
      .prepare("UPDATE dot_spaces SET title = ?, content = ?, updated_at = ? WHERE id = ?")
      .run(space.title.trim(), space.content, now, id);

    return {
      id,
      dotId,
      title: space.title.trim(),
      content: space.content,
      createdAt: existing.created_at,
      updatedAt: now,
    };
  }

  ctx.db
    .prepare("INSERT INTO dot_spaces (id, dot_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, dotId, space.title.trim(), space.content, now, now);

  return {
    id,
    dotId,
    title: space.title.trim(),
    content: space.content,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Delete a Dot Space with strict ownership verification.
 */
export function deleteDotSpace(ctx: VaultCtx, spaceId: string, dotId?: string): boolean {
  if (dotId) {
    const existing = ctx.db.prepare("SELECT * FROM dot_spaces WHERE id = ?").get(spaceId) as RawDotSpaceRow | undefined;
    if (!existing) return false;
    if (existing.dot_id !== dotId) {
      throw new Error(`Forbidden: Space "${spaceId}" belongs to another Dot ("${existing.dot_id}"), ownership check failed.`);
    }
    ctx.db.prepare("DELETE FROM dot_spaces WHERE id = ? AND dot_id = ?").run(spaceId, dotId);
    return true;
  }
  ctx.db.prepare("DELETE FROM dot_spaces WHERE id = ?").run(spaceId);
  return true;
}

interface RawDotTaskRow {
  id: string;
  dot_id: string;
  prompt: string;
  status: string;
  interval_seconds: number | null;
  next_run_at: number | null;
  last_run_at: number | null;
  last_result: string | null;
  error: string | null;
  retry_count: number;
  max_retries: number;
  created_at: number;
  updated_at: number;
}

function toTaskDto(r: RawDotTaskRow): DotTaskDto {
  return {
    id: r.id,
    dotId: r.dot_id,
    prompt: r.prompt,
    status: r.status as DotTaskDto["status"],
    intervalSeconds: r.interval_seconds,
    nextRunAt: r.next_run_at,
    lastRunAt: r.last_run_at,
    lastResult: r.last_result,
    error: r.error,
    retryCount: r.retry_count ?? 0,
    maxRetries: r.max_retries ?? 3,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listDotTasks(ctx: VaultCtx, dotId?: string): DotTaskDto[] {
  if (dotId && dotId.trim() !== "") {
    const stmt = ctx.db.prepare("SELECT * FROM dot_tasks WHERE dot_id = ? ORDER BY created_at DESC");
    const rows = stmt.all(dotId.trim()) as RawDotTaskRow[];
    return rows.map(toTaskDto);
  }
  const stmt = ctx.db.prepare("SELECT * FROM dot_tasks ORDER BY created_at DESC");
  const rows = stmt.all() as RawDotTaskRow[];
  return rows.map(toTaskDto);
}

export function getDotTask(ctx: VaultCtx, taskId: string): DotTaskDto | null {
  const row = ctx.db.prepare("SELECT * FROM dot_tasks WHERE id = ?").get(taskId) as RawDotTaskRow | undefined;
  return row ? toTaskDto(row) : null;
}

export function createDotTask(
  ctx: VaultCtx,
  dotId: string,
  input: {
    prompt: string;
    intervalSeconds?: number | null;
    nextRunAt?: number | null;
    maxRetries?: number;
  }
): DotTaskDto {
  const now = Date.now();
  const id = `task_${crypto.randomUUID().slice(0, 8)}`;
  const nextRunAt = input.nextRunAt ?? (input.intervalSeconds ? now + input.intervalSeconds * 1000 : now);
  const maxRetries = input.maxRetries ?? 3;

  ctx.db
    .prepare(`
      INSERT INTO dot_tasks (id, dot_id, prompt, status, interval_seconds, next_run_at, last_run_at, last_result, error, retry_count, max_retries, created_at, updated_at)
      VALUES (?, ?, ?, 'queued', ?, ?, NULL, NULL, NULL, 0, ?, ?, ?)
    `)
    .run(id, dotId, input.prompt.trim(), input.intervalSeconds ?? null, nextRunAt, maxRetries, now, now);

  return {
    id,
    dotId,
    prompt: input.prompt.trim(),
    status: "queued",
    intervalSeconds: input.intervalSeconds ?? null,
    nextRunAt,
    lastRunAt: null,
    lastResult: null,
    error: null,
    retryCount: 0,
    maxRetries,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateDotTask(
  ctx: VaultCtx,
  taskId: string,
  patch: Partial<DotTaskDto>,
  dotId?: string
): DotTaskDto | null {
  const existing = getDotTask(ctx, taskId);
  if (!existing) return null;
  if (dotId && existing.dotId !== dotId) {
    throw new Error(`Forbidden: Task "${taskId}" belongs to another Dot ("${existing.dotId}"), ownership check failed.`);
  }

  const now = Date.now();
  const next = { ...existing, ...patch, updatedAt: now };

  ctx.db
    .prepare(`
      UPDATE dot_tasks
      SET prompt = ?, status = ?, interval_seconds = ?, next_run_at = ?, last_run_at = ?, last_result = ?, error = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      next.prompt,
      next.status,
      next.intervalSeconds ?? null,
      next.nextRunAt ?? null,
      next.lastRunAt ?? null,
      next.lastResult ?? null,
      next.error ?? null,
      now,
      taskId
    );

  return next;
}

export function deleteDotTask(ctx: VaultCtx, taskId: string, dotId?: string): boolean {
  if (dotId) {
    const existing = getDotTask(ctx, taskId);
    if (!existing) return false;
    if (existing.dotId !== dotId) {
      throw new Error(`Forbidden: Task "${taskId}" belongs to another Dot ("${existing.dotId}"), ownership check failed.`);
    }
    ctx.db.prepare("DELETE FROM dot_tasks WHERE id = ? AND dot_id = ?").run(taskId, dotId);
    return true;
  }
  ctx.db.prepare("DELETE FROM dot_tasks WHERE id = ?").run(taskId);
  return true;
}

/**
 * Claim due background task atomically using SQLite transaction.
 */
export function claimDueDotTask(db: Database.Database): { task: DotTaskDto; dot: DotDto } | null {
  const now = Date.now();
  const claimTx = db.transaction(() => {
    const row = db
      .prepare(`
        SELECT * FROM dot_tasks
        WHERE status NOT IN ('paused', 'running', 'failed') AND next_run_at IS NOT NULL AND next_run_at <= ?
        ORDER BY next_run_at ASC
        LIMIT 1
      `)
      .get(now) as RawDotTaskRow | undefined;

    if (!row) return null;

    db.prepare("UPDATE dot_tasks SET status = 'running', last_run_at = ?, updated_at = ? WHERE id = ?").run(now, now, row.id);

    const dotRow = db.prepare("SELECT * FROM dots WHERE id = ?").get(row.dot_id) as RawDotRow | undefined;
    if (!dotRow) return null;

    return { row, dotRow };
  });

  const claimed = claimTx();
  if (!claimed) return null;

  const { row, dotRow } = claimed;
  const dot: DotDto = {
    id: dotRow.id,
    name: dotRow.name,
    character: dotRow.character as DotDto["character"],
    role: dotRow.role,
    description: dotRow.description,
    systemPrompt: dotRow.system_prompt,
    model: dotRow.model || "auto",
    tools: safeParseJson(dotRow.tools, []),
    status: dotRow.status as DotDto["status"],
    workingDirectory: dotRow.working_directory || process.cwd(),
    createdAt: dotRow.created_at,
    updatedAt: dotRow.updated_at,
  };

  return { task: toTaskDto({ ...row, status: "running" }), dot };
}

/**
 * Complete background task and schedule next occurrence if repeating.
 * Supports exponential retry backoff on failures up to max_retries.
 */
export function completeDotTask(
  db: Database.Database,
  taskId: string,
  outcome: { resultText?: string; error?: string }
): void {
  const now = Date.now();
  const row = db.prepare("SELECT * FROM dot_tasks WHERE id = ?").get(taskId) as RawDotTaskRow | undefined;
  if (!row) return;

  if (outcome.error) {
    const currentRetries = row.retry_count ?? 0;
    const nextRetry = currentRetries + 1;
    const maxRetries = row.max_retries ?? 3;

    if (nextRetry >= maxRetries) {
      // Exceeded max retries: mark as failed
      db.prepare(`
        UPDATE dot_tasks
        SET status = 'failed', retry_count = ?, error = ?, last_run_at = ?, updated_at = ?
        WHERE id = ?
      `).run(nextRetry, outcome.error, now, now, taskId);
    } else {
      // Exponential backoff with jitter: base 5s * 2^(retry-1) + jitter
      const baseDelayMs = 5000;
      const exponentialDelay = baseDelayMs * Math.pow(2, nextRetry - 1);
      const jitter = Math.floor(Math.random() * 1000);
      const delayMs = Math.min(3600_000, exponentialDelay + jitter);
      const nextRunAt = now + delayMs;

      db.prepare(`
        UPDATE dot_tasks
        SET status = 'queued', retry_count = ?, next_run_at = ?, error = ?, last_run_at = ?, updated_at = ?
        WHERE id = ?
      `).run(nextRetry, nextRunAt, outcome.error, now, now, taskId);
    }
    return;
  }

  // Success: reset retry_count to 0
  const interval = row.interval_seconds;
  const nextRunAt = interval && interval > 0 ? now + interval * 1000 : null;
  const nextStatus = interval && interval > 0 ? "queued" : "completed";

  db.prepare(`
    UPDATE dot_tasks
    SET status = ?, retry_count = 0, next_run_at = ?, last_run_at = ?, last_result = ?, error = NULL, updated_at = ?
    WHERE id = ?
  `).run(nextStatus, nextRunAt, now, outcome.resultText || null, now, taskId);
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
