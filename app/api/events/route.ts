/**
 * P6: calendar events API — importers: app/(app)/calendar/page.tsx UI component.
 * Affected API: GET/POST /api/events
 * Data schema: events (lib/db/schema.ts)
 * User instruction: continue
 */
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { listEvents, createEvent, EventError } from "@/lib/event-service";

export async function GET(req: Request) {
  try {
    const ctx = await requireVault();
    const sp = new URL(req.url).searchParams;
    const events = listEvents(ctx, {
      after: sp.get("after") ? Number(sp.get("after")) : undefined,
      before: sp.get("before") ? Number(sp.get("before")) : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return Response.json({ events });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireVault();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object")
      return Response.json(
        { error: { code: "invalid_body", message: "Bad request body" } },
        { status: 400 },
      );
    const event = createEvent(ctx, {
      title: body.title,
      startAt: body.startAt,
      endAt: body.endAt ?? null,
      allDay: body.allDay ?? false,
      color: body.color ?? null,
      notes: body.notes ?? null,
    });
    return Response.json({ event }, { status: 201 });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof EventError && e.code === "invalid") {
      return Response.json({ error: { code: "invalid", message: e.message } }, { status: 400 });
    }
    return internalResponse(e);
  }
}
