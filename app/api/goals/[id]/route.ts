/**
 * P6: goals detail API — importers: app/(app)/goals/page.tsx UI component.
 * Affected API: GET/PATCH/DELETE /api/goals/:id,
 *   GET/POST /api/goals/:id/milestones
 * Data schema: goals, goal_milestones (lib/db/schema.ts)
 * User instruction: continue
 */
import { requireVault } from "@/server/vault-guard";
import {
  getGoal,
  updateGoal,
  deleteGoal,
  listMilestones,
  createMilestone,
} from "@/lib/goal-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireVault();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json(
      { error: { code: "invalid", message: "Invalid goal id" } },
      { status: 400 },
    );
  const goal = getGoal(ctx, id);
  if (!goal)
    return Response.json(
      { error: { code: "not_found", message: `Goal ${id} not found` } },
      { status: 404 },
    );
  return Response.json({ goal });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireVault();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json(
      { error: { code: "invalid", message: "Invalid goal id" } },
      { status: 400 },
    );
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return Response.json(
      { error: { code: "invalid_body", message: "Bad request body" } },
      { status: 400 },
    );
  const goal = updateGoal(ctx, id, {
    title: body.title,
    description: body.description,
    targetDate: body.targetDate,
    progressPct: body.progressPct,
  });
  return Response.json({ goal });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireVault();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json(
      { error: { code: "invalid", message: "Invalid goal id" } },
      { status: 400 },
    );
  deleteGoal(ctx, id);
  return Response.json({ ok: true });
}

