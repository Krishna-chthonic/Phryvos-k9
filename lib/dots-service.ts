import type { VaultCtx } from "@/lib/providers-service";
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

export interface DotMessageDto {
  id: string;
  dotId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
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
  return true;
}

/**
 * List messages for a Dot.
 */
export function listDotMessages(ctx: VaultCtx, dotId: string): DotMessageDto[] {
  const stmt = ctx.db.prepare("SELECT * FROM dot_messages WHERE dot_id = ? ORDER BY created_at ASC");
  const rows = stmt.all(dotId) as RawDotMessageRow[];

  return rows.map((r) => ({
    id: r.id,
    dotId: r.dot_id,
    role: r.role as DotMessageDto["role"],
    content: r.content,
    toolName: r.tool_name,
    toolArgs: r.tool_args,
    toolResult: r.tool_result,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/**
 * Append message to a Dot's conversation.
 */
export function appendDotMessage(
  ctx: VaultCtx,
  dotId: string,
  msg: {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    toolName?: string;
    toolArgs?: string;
    toolResult?: string;
    status?: string;
  }
): DotMessageDto {
  const id = `msg_${crypto.randomUUID()}`;
  const now = Date.now();

  const stmt = ctx.db.prepare(`
    INSERT INTO dot_messages (id, dot_id, role, content, tool_name, tool_args, tool_result, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    dotId,
    msg.role,
    msg.content,
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
    toolName: msg.toolName || null,
    toolArgs: msg.toolArgs || null,
    toolResult: msg.toolResult || null,
    status: msg.status || "done",
    createdAt: now,
  };
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
 * Delete a Dot Space.
 */
export function deleteDotSpace(ctx: VaultCtx, spaceId: string): boolean {
  ctx.db.prepare("DELETE FROM dot_spaces WHERE id = ?").run(spaceId);
  return true;
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
