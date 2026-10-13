import { z } from "zod";
import { trackingRoute } from "@/server/tracking-guard";
import { createProject, listProjects } from "@/lib/tracking-service";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET  /api/projects?archived=1 → list (default: active only)
 * POST /api/projects            → create
 */
export async function GET(req: Request) {
  const includeArchived = new URL(req.url).searchParams.get("archived") === "1";
  return trackingRoute((ctx) =>
    Response.json({
      projects: listProjects(ctx, { includeArchived }),
    }),
  );
}

const Body = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  color: z.string().max(60).nullable().optional(),
  startDate: z.string().regex(DATE, "Use YYYY-MM-DD").nullable().optional(),
  endDate: z.string().regex(DATE, "Use YYYY-MM-DD").nullable().optional(),
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
    const project = createProject(ctx, body.data);
    return Response.json({ project }, { status: 201 });
  });
}