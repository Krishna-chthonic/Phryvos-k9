import { z } from "zod";
import { trackingRoute } from "@/server/tracking-guard";
import { createTask, listTasks } from "@/lib/tracking-service";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET  /api/tasks?projectId=&status=&limit= → list (ordered priority/due)
 * POST /api/tasks                          → create
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const projectId = sp.get("projectId");
  const status = sp.get("status");
  const limit = sp.get("limit");
  return trackingRoute((ctx) =>
    Response.json({
      tasks: listTasks(ctx, {
        projectId: projectId ? Number(projectId) : undefined,
        status: status as "todo" | "doing" | "done" | undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    }),
  );
}

const Body = z.object({
  projectId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10000).optional(),
  status: z.enum(["todo", "doing", "done"]).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  dueDate: z.string().regex(DATE, "Use YYYY-MM-DD").nullable().optional(),
  startDate: z.string().regex(DATE, "Use YYYY-MM-DD").nullable().optional(),
  tags: z.array(z.string().max(60)).max(50).optional(),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      {
        error: { code: "invalid_body", message: body.error.issues[0]?.message ?? "Bad body" },
      },
      { status: 400 },
    );
  return trackingRoute((ctx) => {
    const task = createTask(ctx, body.data);
    return Response.json({ task }, { status: 201 });
  });
}