/**
 * P6: server-side CRUD for the local calendar events.
 *
 * Importers/callers:
 *   - app/api/events/route.ts (GET/POST)
 *   - app/api/events/[id]/route.ts (GET/PATCH/DELETE)
 *   - Agent tools in lib/agent/tools/goals-events.ts (event_create/list)
 *
 * Data schema: events (from lib/db/schema.ts)
 */

import type Database from "better-sqlite3";

export interface EventCtx {
  db: Database.Database;
}

export class EventError extends Error {
  constructor(
    readonly code: "not_found" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "EventError";
  }
}

export interface EventRow {
  id: number;
  title: string;
  startAt: number;
  endAt: number | null;
  allDay: boolean;
  color: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
}

export function listEvents(
  ctx: EventCtx,
  opts: { after?: number; before?: number; limit?: number },
): EventRow[] {
  const wh: string[] = [];
  const params: unknown[] = [];
  if (opts.after !== undefined) {
    wh.push("start_at >= ?");
    params.push(opts.after);
  }
  if (opts.before !== undefined) {
    wh.push("start_at < ?");
    params.push(opts.before);
  }
  const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
  const rawLimit = Number(opts.limit);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(1000, rawLimit)) : 500;

  const rows = ctx.db.prepare(`
    SELECT id, title, start_at AS startAt, end_at AS endAt,
           all_day AS allDay, color, notes,
           created_at AS createdAt, updated_at AS updatedAt
    FROM events ${where}
    ORDER BY start_at ASC
    LIMIT ?
  `).all(...params, limit) as Array<Record<string, unknown>>;

  return rows.map((r) => eventRow(r));
}

export function getEvent(ctx: EventCtx, id: number): EventRow | null {
  const r = ctx.db.prepare(`
    SELECT id, title, start_at AS startAt, end_at AS endAt,
           all_day AS allDay, color, notes,
           created_at AS createdAt, updated_at AS updatedAt
    FROM events WHERE id = ?
  `).get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return eventRow(r);
}

function eventRow(r: Record<string, unknown>): EventRow {
  return {
    id: r.id as number,
    title: r.title as string,
    startAt: r.start_at as number,
    endAt: r.end_at as number | null,
    allDay: Boolean(r.all_day),
    color: (r.color as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

export interface CreateEventInput {
  title: string;
  startAt: number;
  endAt?: number | null;
  allDay?: boolean;
  color?: string | null;
  notes?: string | null;
}

export function createEvent(ctx: EventCtx, input: CreateEventInput): EventRow {
  if (!input.title.trim())
    throw new EventError("invalid", "Event title is required");
  if (!input.startAt)
    throw new EventError("invalid", "startAt is required");

  // auto-end: 1 hour after start for non-all-day events
  let endAt = input.endAt ?? null;
  if (endAt === null && !input.allDay) {
    endAt = input.startAt + 60 * 60 * 1000;
  }

  const now = Date.now();
  const result = ctx.db.prepare(`
    INSERT INTO events (title, start_at, end_at, all_day, color, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.title.trim(),
    input.startAt,
    endAt,
    input.allDay ? 1 : 0,
    input.color ?? null,
    input.notes ?? null,
    now,
    now,
  );

  const id = Number(result.lastInsertRowid);
  return getEvent(ctx, id)!;
}

export interface UpdateEventInput {
  title?: string;
  startAt?: number;
  endAt?: number | null;
  allDay?: boolean;
  color?: string | null;
  notes?: string | null;
}

export function updateEvent(ctx: EventCtx, id: number, input: UpdateEventInput): EventRow {
  const existing = getEvent(ctx, id);
  if (!existing)
    throw new EventError("not_found", `Event ${id} not found`);

  const title = input.title?.trim() ?? existing.title;
  const startAt = input.startAt ?? existing.startAt;
  let endAt = input.endAt ?? existing.endAt;
  const allDay = input.allDay ?? existing.allDay;
  const color = input.color ?? existing.color;
  const notes = input.notes ?? existing.notes;

  // auto-end
  if (endAt === null && !allDay) {
    endAt = startAt + 60 * 60 * 1000;
  }

  ctx.db.prepare(`
    UPDATE events
    SET title = ?, start_at = ?, end_at = ?, all_day = ?, color = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(title, startAt, endAt, allDay ? 1 : 0, color, notes, Date.now(), id);

  return getEvent(ctx, id)!;
}

export function deleteEvent(ctx: EventCtx, id: number): void {
  const existing = getEvent(ctx, id);
  if (!existing)
    throw new EventError("not_found", `Event ${id} not found`);
  ctx.db.prepare("DELETE FROM events WHERE id = ?").run(id);
}
