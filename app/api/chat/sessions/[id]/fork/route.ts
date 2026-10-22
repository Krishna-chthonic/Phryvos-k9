import { z } from "zod";
import {
  internalResponse,
  requireVault,
  vaultGuardResponse,
} from "@/server/vault-guard";
import { forkSession } from "@/lib/chat-service";
import type { VaultCtx } from "@/lib/providers-service";

const ForkBodySchema = z.object({
  cutoffMessageId: z.string().min(1, "cutoffMessageId is required"),
  title: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionId = (await params).id;
  try {
    const json = await req.json().catch(() => null);
    const parsed = ForkBodySchema.safeParse(json);
    if (!parsed.success) {
      return Response.json(
        {
          error: {
            code: "invalid_body",
            message: parsed.error.issues[0]?.message || "Invalid body",
          },
        },
        { status: 400 },
      );
    }

    const vctx = await requireVault();
    const ctx: VaultCtx = { db: vctx.db, key: vctx.key };

    const result = forkSession(
      ctx,
      sessionId,
      parsed.data.cutoffMessageId,
      parsed.data.title,
    );

    return Response.json(result, { status: 201 });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof Error && /^Source session not found/.test(e.message)) {
      return Response.json(
        { error: { code: "not_found", message: e.message } },
        { status: 404 },
      );
    }
    if (e instanceof Error && /^Cutoff message not found/.test(e.message)) {
      return Response.json(
        { error: { code: "cutoff_not_found", message: e.message } },
        { status: 404 },
      );
    }
    return internalResponse(e);
  }
}
