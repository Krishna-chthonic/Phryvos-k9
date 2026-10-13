/**
 * P6: goals list API — importers: app/(app)/goals/page.tsx UI component.
 * Affected API: GET/POST /api/goals
 * Data schema: goals, goal_milestones (lib/db/schema.ts)
 * User instruction: continue
 */
import { requireVault } from "@/server/vault-guard";
import { listGoals, createGoal } from "@/lib/goal-service";

export async function GET() {
  const ctx = await requireVault();
  return Response.json({ goals: listGoals(ctx) });
}

export async function POST(req: Request) {
  const ctx = await requireVault();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return Response.json(
      { error: { code: "invalid_body", message: "Bad request body" } },
      { status: 400 },
    );
  const goal = createGoal(ctx, {
    title: body.title,
    description: body.description ?? null,
    targetDate: body.targetDate ?? null,
  });
  return Response.json({ goal }, { status: 201 });
}
