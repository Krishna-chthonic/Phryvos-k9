import { z } from "zod";
import { trackingRoute, parseId } from "@/server/tracking-guard";
import {
  getProject,
  updateProject,
  deleteProject,
} from "@/lib/tracking-service";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET    /api/projects/:id → single
 * PATCH  /api/projects/:id → update (title/desc/color/status/dates)
 * DELETE /api/projects/:id → hard cascade delete (tasks, deps, time, project)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = await parseId(params);
  if (id === null)
    return Response.json(
      { error: { code: "not_found", message: "Invalid project id" } },
      { status: 404 },
    );
  return trackingRoute((ctx) => {
    const p = getProject(ctx, id);
    if (!p)
      return Response.json(
        { error: { code: "not_found", message: `Project ${id} not found` } },
        { status: 404 },
      );
    return Response.json({ project: p });
  });
}

const PatchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  color: z.string().max(60).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
  startDate: z.string().regex(DATE, "Use YYYY-MM-DD").nullable().optional(),
  endDate: z.string().regex(DATE, "Use YYYY-MM-DD").nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = await parseId(params);
  if (id === null)
    return Response.json(
      { error: { code: "not_found", message: "Invalid project id" } },
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
    const project = updateProject(ctx, id, body.data);
    return Response.json({ project });
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = await parseId(params);
  if (id === null)
    return Response.json(
      { error: { code: "not_found", message: "Invalid project id" } },
      { status: 404 },
    );
  return trackingRoute((ctx) => {
    deleteProject(ctx, id);
    return Response.json({ ok: true });
  });
}