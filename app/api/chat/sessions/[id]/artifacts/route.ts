import { z } from "zod";
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import type { VaultCtx } from "@/lib/providers-service";
import { createArtifact, listArtifacts } from "@/lib/chat-artifacts";
import { randomUUID } from "node:crypto";

const CreateArtifactSchema = z.object({
  id: z.string().optional(),
  messageId: z.string().nullable().optional(),
  title: z.string().min(1).max(200),
  type: z.enum(["html", "physics", "react", "svg", "code"]),
  content: z.string().min(1),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionId = (await params).id;
  try {
    const ctx = await requireVault();
    const artifacts = listArtifacts(ctx.db, sessionId);
    return Response.json({ artifacts });
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
  const sessionId = (await params).id;
  try {
    const ctx = await requireVault();
    const body = CreateArtifactSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return Response.json(
        { error: { code: "invalid_body", message: "Invalid artifact payload" } },
        { status: 400 },
      );
    }

    const artifact = createArtifact(ctx.db, {
      id: body.data.id || `art_${randomUUID()}`,
      sessionId,
      messageId: body.data.messageId,
      title: body.data.title,
      type: body.data.type,
      content: body.data.content,
    });

    return Response.json({ artifact }, { status: 201 });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}
