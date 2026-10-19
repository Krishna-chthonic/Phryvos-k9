import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { pendingApprovals } from "@/lib/agent/guardrails";
import { daemons } from "@/lib/agent/daemons";

/**
 * GET /api/chat/approvals
 * Returns:
 * - pending: Interactive running agent tool approvals waiting for user response
 * - stagedDaemons: Overnight Planner & Nightly Tutor actions waiting for Morning Review
 */
export async function GET(_req: Request) {
  try {
    await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
  return Response.json({
    pending: pendingApprovals(),
    stagedDaemons: daemons.getStagedActions(),
  });
}

/**
 * POST /api/chat/approvals
 * Body:
 * - { action: "run_daemon", daemon: "planner" | "tutor" }
 * - { action: "resolve_staged", id: string, decision: "approved" | "rejected" }
 * - { action: "resolve_all", decision: "approved" | "rejected" }
 */
export async function POST(req: Request) {
  try {
    await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }

  const body = await req.json().catch(() => ({}));
  const { action, daemon, id, decision } = body;

  if (action === "run_daemon") {
    if (daemon === "planner") {
      const result = await daemons.runPlannerPass();
      return Response.json({ ok: true, action: result });
    }
    if (daemon === "tutor") {
      const result = await daemons.runNightlyTutorPass();
      return Response.json({ ok: true, action: result });
    }
    return Response.json({ error: "Unknown daemon" }, { status: 400 });
  }

  if (action === "resolve_staged" && id && decision) {
    const success = daemons.resolveAction(id, decision);
    return Response.json({ ok: success });
  }

  if (action === "resolve_all" && decision) {
    const count = daemons.resolveAllPending(decision);
    return Response.json({ ok: true, resolvedCount: count });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
