import { z } from "zod";
import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { getApproval, resolveApproval } from "@/lib/agent/guardrails";
import { generateUnifiedDiff } from "@/lib/agent/diff-preview";

/**
 * Generate diff preview for approval UI
 */
function generateDiffPreview(tool: string, args: Record<string, unknown>): string {
  if (tool === "write_file" && args.path && typeof args.content === "string") {
    const oldContent = ""; // For new files, old content is empty
    const newContent = args.content;
    return generateUnifiedDiff(oldContent, newContent, String(args.path));
  }
  if (tool === "delete_file" && args.path) {
    // For deletion, we'd need to read the file first - simplified for now
    return generateUnifiedDiff("FILE CONTENTS HERE", "", String(args.path));
  }
  return "Diff preview not available for this tool type.";
}

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

  const body = z
    .object({
      decision: z.enum(["allow", "deny"]),
      actionHash: z.string().optional(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: { code: "invalid_body", message: "decision must be \"allow\" or \"deny\"" } },
      { status: 400 },
    );

  const res = resolveApproval(id, body.data.decision, body.data.actionHash);
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
