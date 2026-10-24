/**
 * P6: milestone detail API — importers: app/(app)/goals/page.tsx UI component.
 * Affected API: PATCH/DELETE /api/goals/:gid/milestones/:mid
 * Data schema: goal_milestones (lib/db/schema.ts)
 * User instruction: continue
 */
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { updateMilestone, deleteMilestone } from "@/lib/goal-service";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  try {
    const ctx = await requireVault();
    const goalId = Number((await params).id);
    const milestoneId = Number((await params).mid);
    if (!Number.isInteger(goalId) || goalId <= 0 || !Number.isInteger(milestoneId) || milestoneId <= 0)
      return Response.json(
        { error: { code: "invalid", message: "Invalid goal or milestone id" } },
        { status: 400 },
      );
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object")
      return Response.json(
        { error: { code: "invalid_body", message: "Bad request body" } },
        { status: 400 },
      );
    const milestone = updateMilestone(ctx, goalId, milestoneId, {
      title: body.title,
      dueDate: body.dueDate,
      done: body.done,
    });
    return Response.json({ milestone });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  try {
    const ctx = await requireVault();
    const goalId = Number((await params).id);
    const milestoneId = Number((await params).mid);
    if (!Number.isInteger(goalId) || goalId <= 0 || !Number.isInteger(milestoneId) || milestoneId <= 0)
      return Response.json(
        { error: { code: "invalid", message: "Invalid goal or milestone id" } },
        { status: 400 },
      );
    deleteMilestone(ctx, goalId, milestoneId);
    return Response.json({ ok: true });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}
