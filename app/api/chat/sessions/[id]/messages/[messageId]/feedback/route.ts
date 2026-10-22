import { z } from "zod";
import {
  internalResponse,
  requireVault,
  vaultGuardResponse,
} from "@/server/vault-guard";
import { setMessageFeedback } from "@/lib/chat-service";
import type { VaultCtx } from "@/lib/providers-service";

const FeedbackBodySchema = z.object({
  feedback: z.enum(["helpful", "unhelpful"]).nullable(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id: sessionId, messageId } = await params;
  try {
    const json = await req.json().catch(() => null);
    const parsed = FeedbackBodySchema.safeParse(json);
    if (!parsed.success) {
      return Response.json(
        {
          error: {
            code: "invalid_body",
            message: parsed.error.issues[0]?.message || "Invalid feedback value",
          },
        },
        { status: 400 },
      );
    }

    const vctx = await requireVault();
    const ctx: VaultCtx = { db: vctx.db, key: vctx.key };

    setMessageFeedback(ctx, sessionId, messageId, parsed.data.feedback);

    return Response.json({ ok: true, feedback: parsed.data.feedback });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof Error && /^Session not found/.test(e.message)) {
      return Response.json(
        { error: { code: "not_found", message: e.message } },
        { status: 404 },
      );
    }
    if (e instanceof Error && /^Message not found/.test(e.message)) {
      return Response.json(
        { error: { code: "not_found", message: e.message } },
        { status: 404 },
      );
    }
    return internalResponse(e);
  }
}
