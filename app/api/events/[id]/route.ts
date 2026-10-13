/**
 * P6: calendar event detail API — importers: app/(app)/calendar/page.tsx UI component.
 * Affected API: GET/PATCH/DELETE /api/events/:id
 * Data schema: events (lib/db/schema.ts)
 * User instruction: continue
 */
import { requireVault } from "@/server/vault-guard";
import { getEvent, updateEvent, deleteEvent } from "@/lib/event-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireVault();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json(
      { error: { code: "invalid", message: "Invalid event id" } },
      { status: 400 },
    );
  const event = getEvent(ctx, id);
  if (!event)
    return Response.json(
      { error: { code: "not_found", message: `Event ${id} not found` } },
      { status: 404 },
    );
  return Response.json({ event });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireVault();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json(
      { error: { code: "invalid", message: "Invalid event id" } },
      { status: 400 },
    );
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return Response.json(
      { error: { code: "invalid_body", message: "Bad request body" } },
      { status: 400 },
    );
  const event = updateEvent(ctx, id, {
    title: body.title,
    startAt: body.startAt,
    endAt: body.endAt ?? null,
    allDay: body.allDay,
    color: body.color,
    notes: body.notes,
  });
  return Response.json({ event });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireVault();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json(
      { error: { code: "invalid", message: "Invalid event id" } },
      { status: 400 },
    );
  deleteEvent(ctx, id);
  return Response.json({ ok: true });
}
