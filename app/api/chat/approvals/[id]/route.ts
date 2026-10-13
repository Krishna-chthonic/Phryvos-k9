import { z } from "zod";
import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { getApproval, resolveApproval } from "@/lib/agent/guardrails";

/**
 * PUT /api/chat/approvals/:id  {"decision": "allow" | "deny"}
 * Resolves a pending destructive-tool approval the agent loop is waiting on.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  try {
    await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }

  const body = z.object({ decision: z.enum(["allow", "deny"]) }).safeParse(
    await req.json().catch(() => null),
  );
  if (!body.success)
    return Response.json(
      { error: { code: "invalid_body", message: "decision must be \"allow\" or \"deny\"" } },
      { status: 400 },
    );

  const res = resolveApproval(id, body.data.decision);
  if (!res.ok)
    return Response.json({ error: { code: "unknown", message: res.error } }, { status: 404 });
  return Response.json({ ok: true });
}

/** GET → the approval's current state (for the UI while waiting) */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  try {
    await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
  const a = getApproval(id);
  if (!a)
    return Response.json({ error: { code: "not_found", message: "Unknown approval" } }, { status: 404 });
  return Response.json({
    id: a.id,
    tool: a.tool,
    args: a.args,
    description: a.description,
    createdAt: a.createdAt,
    state: a.state,
  });
}
