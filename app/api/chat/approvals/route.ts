import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { pendingApprovals } from "@/lib/agent/guardrails";

/**
 * GET /api/chat/approvals → {pending: [{id, tool, args, description, createdAt}]}
 * The UI polls this to surface destructive-tool approvals that a running
 * agent turn is waiting on (the SSE stream already emits them live).
 */
export async function GET(_req: Request) {
  try {
    await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
  return Response.json({ pending: pendingApprovals() });
}
