import { z } from "zod";
import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { editUserMessage, listMessages } from "@/lib/chat-service";

/**
 * PATCH /api/chat/sessions/:id/messages/:messageId {"content": "…"}
 * Replace a user message: content swapped, everything after it
 * soft-deleted, stored summary reset (its context changed).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id: sessionId, messageId } = await params;
  const body = z
    .object({
      content: z.string().min(1),
      truncate: z.boolean().optional(),
    })
    .safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: { code: "invalid_body", message: "Bad {content}" } },
      { status: 400 },
    );
  try {
    const ctx = await requireVault();
    const truncate = body.data.truncate ?? true;
    editUserMessage(ctx, sessionId, messageId, body.data.content, truncate);
    return Response.json({ messages: listMessages(ctx, sessionId) });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof Error && /^(Session|Message) not found/.test(e.message))
      return Response.json(
        { error: { code: "not_found", message: e.message } },
        { status: 404 },
      );
    return internalResponse(e);
  }
}
