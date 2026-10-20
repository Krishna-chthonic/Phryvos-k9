import { z } from "zod";
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { getDot, updateDot, deleteDot, listDotMessages, listDotSpaces } from "@/lib/dots-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    const ctx = await requireVault();
    const dot = getDot(ctx, id);
    if (!dot) {
      return Response.json({ error: { code: "not_found", message: "Dot not found" } }, { status: 404 });
    }
    const messages = listDotMessages(ctx, id);
    const spaces = listDotSpaces(ctx, id);
    return Response.json({ dot, messages, spaces });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  character: z.enum(["blue", "mint", "orange", "purple"]).optional(),
  role: z.string().min(1).optional(),
  description: z.string().optional(),
  systemPrompt: z.string().min(1).optional(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  status: z.enum(["idle", "working", "paused", "complete", "needs-input"]).optional(),
  workingDirectory: z.string().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    const ctx = await requireVault();
    const body = await req.json();
    const parsed = UpdateSchema.parse(body);
    const dot = updateDot(ctx, id, parsed);
    return Response.json({ dot });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof z.ZodError) {
      return Response.json({ error: { code: "invalid_input", issues: e.issues } }, { status: 400 });
    }
    return internalResponse(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    const ctx = await requireVault();
    deleteDot(ctx, id);
    return Response.json({ ok: true });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}
