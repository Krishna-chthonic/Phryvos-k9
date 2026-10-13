import { z } from "zod";
import { trackingRoute, parseId } from "@/server/tracking-guard";
import {
  addTimeEntry,
  listTimeEntries,
  deleteTimeEntry,
} from "@/lib/tracking-service";

const Body = z.object({
  taskId: z.number().int().positive().nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  startedAt: z.number().int().positive().optional(),
  durationSec: z.number().int().positive(),
  note: z.string().max(5000).nullable().optional(),
});

/**
 * GET     /api/tasks/:id/time?limit= → time entries (desc by startedAt)
 * POST    /api/tasks/:id/time        → add entry (taskId/projectId in body)
 * DELETE  /api/tasks/:id/time        → delete entry (body: { id, taskId? })
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const taskId = await parseId(params);
  if (taskId === null)
    return Response.json(
      { error: { code: "not_found", message: "Invalid task id" } },
      { status: 404 },
    );
  const sp = new URL(req.url).searchParams;
  const limit = sp.get("limit");
  return trackingRoute((ctx) =>
    Response.json({
      entries: listTimeEntries(ctx, { taskId, limit: limit ? Number(limit) : undefined }),
    }),
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const taskId = await parseId(params);
  if (taskId === null)
    return Response.json(
      { error: { code: "not_found", message: "Invalid task id" } },
      { status: 404 },
    );
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      {
        error: { code: "invalid_body", message: body.error.issues[0]?.message ?? "Bad body" },
      },
      { status: 400 },
    );
  return trackingRoute((ctx) => {
    const entry = addTimeEntry(ctx, {
      ...body.data,
      taskId: body.data.taskId ?? taskId,
    });
    return Response.json({ entry }, { status: 201 });
  });
}

const DelBody = z.object({
  id: z.number().int().positive(),
  taskId: z.number().int().positive().optional(),
});

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const taskId = await parseId(params);
  if (taskId === null)
    return Response.json(
      { error: { code: "not_found", message: "Invalid task id" } },
      { status: 404 },
    );
  const body = DelBody.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      {
        error: { code: "invalid_body", message: body.error.issues[0]?.message ?? "Bad body" },
      },
      { status: 400 },
    );
  return trackingRoute((ctx) => {
    deleteTimeEntry(ctx, body.data.id, body.data.taskId);
    return Response.json({ ok: true });
  });
}