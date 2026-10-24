/**
 * P6/P8: goal milestones sub-route — importers: components/goals/GoalsApp.tsx
 * Affected API: GET/POST /api/goals/:id/milestones
 * Data schema: goal_milestones (lib/db/schema.ts)
 */
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { listMilestones, createMilestone } from "@/lib/goal-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireVault();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0)
      return Response.json(
        { error: { code: "invalid", message: "Invalid goal id" } },
        { status: 400 },
      );
    const milestones = listMilestones(ctx, id);
    return Response.json({ milestones });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireVault();
    const goalId = Number((await params).id);
    if (!Number.isInteger(goalId) || goalId <= 0)
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
    const milestone = createMilestone(ctx, {
      goalId,
      title: body.title,
      dueDate: body.dueDate ?? null,
    });
    return Response.json({ milestone }, { status: 201 });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}
