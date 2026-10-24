/**
 * P6: calendar event detail API — importers: app/(app)/calendar/page.tsx UI component.
 * Affected API: GET/PATCH/DELETE /api/events/:id
 * Data schema: events (lib/db/schema.ts)
 * User instruction: continue
 */
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { getEvent, updateEvent, deleteEvent, EventError } from "@/lib/event-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
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
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
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
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof EventError) {
      const status = e.code === "not_found" ? 404 : 400;
      return Response.json({ error: { code: e.code, message: e.message } }, { status });
    }
    return internalResponse(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireVault();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0)
      return Response.json(
        { error: { code: "invalid", message: "Invalid event id" } },
        { status: 400 },
      );
    deleteEvent(ctx, id);
    return Response.json({ ok: true });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof EventError && e.code === "not_found") {
      return Response.json({ error: { code: "not_found", message: e.message } }, { status: 404 });
    }
    return internalResponse(e);
  }
}
