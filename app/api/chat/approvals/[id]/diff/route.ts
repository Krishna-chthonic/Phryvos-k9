import { z } from "zod";
import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { getApproval } from "@/lib/agent/guardrails";
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

/** GET /api/chat/approvals/:id/diff → unified diff preview for the approval */
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

  try {
    const diff = generateDiffPreview(a.tool, a.args);
    return Response.json({ diff, tool: a.tool });
  } catch (e) {
    return Response.json({ error: { code: "diff_failed", message: String(e) } }, { status: 500 });
  }
}