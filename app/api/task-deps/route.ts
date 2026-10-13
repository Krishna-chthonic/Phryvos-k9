import { trackingRoute } from "@/server/tracking-guard";
import { listTaskDeps } from "@/lib/tracking-service";

/**
 * GET /api/task-deps?limit= → all task_deps edges (bulk, for board + Gantt)
 */
export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 500);
  return trackingRoute((ctx) =>
    Response.json({ deps: listTaskDeps(ctx, { limit }) }),
  );
}