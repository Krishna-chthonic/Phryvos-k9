import { z } from "zod";
import { trackingRoute, parseId } from "@/server/tracking-guard";
import { addTaskDependency, removeTaskDependency, taskDependencies } from "@/lib/tracking-service";

/**
 * GET     /api/tasks/:id/deps → { blockers, blocked }
 * POST    /api/tasks/:id/deps → add edge (taskId blocks blocksTaskId)
 * DELETE  /api/tasks/:id/deps → remove edge
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
    const deps = taskDependencies(ctx, id);
    return Response.json({ deps });
  });
}

const AddBody = z.object({
  blocksTaskId: z.number().int().positive(),
});

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
  const body = AddBody.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      {
        error: { code: "invalid_body", message: body.error.issues[0]?.message ?? "Bad body" },
      },
      { status: 400 },
    );
  return trackingRoute((ctx) => {
    addTaskDependency(ctx, { taskId, blocksTaskId: body.data.blocksTaskId });
    return Response.json({ ok: true }, { status: 201 });
  });
}

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
  const body = AddBody.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      {
        error: { code: "invalid_body", message: body.error.issues[0]?.message ?? "Bad body" },
      },
      { status: 400 },
    );
  return trackingRoute((ctx) => {
    removeTaskDependency(ctx, { taskId, blocksTaskId: body.data.blocksTaskId });
    return Response.json({ ok: true });
  });
}