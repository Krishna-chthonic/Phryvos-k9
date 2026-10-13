import { z } from "zod";
import { trackingRoute, parseId } from "@/server/tracking-guard";
import {
  getTask,
  updateTask,
  deleteTask,
  openBlockers,
  taskDependencies,
} from "@/lib/tracking-service";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET    /api/tasks/:id            → task + deps + open blockers
 * PATCH  /api/tasks/:id            → update (enforces blocked-complete 409)
 * DELETE /api/tasks/:id            → hard delete (deps, time, task)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = await parseId(params);
  if (id === null)
    return Response.json(
      { error: { code: "not_found", message: "Invalid task id" } },
      { status: 404 },
    );
  return trackingRoute((ctx) => {
    const task = getTask(ctx, id);
    const deps = taskDependencies(ctx, id);
    const blockers = openBlockers(ctx, id);
    return Response.json({ task, deps, blockers });
  });
}

const PatchBody = z.object({
  projectId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: z.enum(["todo", "doing", "done"]).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  dueDate: z.string().regex(DATE, "Use YYYY-MM-DD").nullable().optional(),
  startDate: z.string().regex(DATE, "Use YYYY-MM-DD").nullable().optional(),
  tags: z.array(z.string().max(60)).max(50).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = await parseId(params);
  if (id === null)
    return Response.json(
      { error: { code: "not_found", message: "Invalid task id" } },
      { status: 404 },
    );
  const body = PatchBody.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      {
        error: { code: "invalid_body", message: body.error.issues[0]?.message ?? "Bad body" },
      },
      { status: 400 },
    );
  return trackingRoute((ctx) => {
    const task = updateTask(ctx, id, body.data);
    return Response.json({ task });
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = await parseId(params);
  if (id === null)
    return Response.json(
      { error: { code: "not_found", message: "Invalid task id" } },
      { status: 404 },
    );
  return trackingRoute((ctx) => {
    deleteTask(ctx, id);
    return Response.json({ ok: true });
  });
}