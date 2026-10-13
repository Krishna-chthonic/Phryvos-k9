import { z } from "zod";
import { vaultRoute, internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import type { VaultCtx } from "@/lib/providers-service";
import {
  deleteSession,
  getSession,
  listMessages,
  renameSession,
} from "@/lib/chat-service";

function notFound(id: string): Response {
  return Response.json(
    { error: { code: "not_found", message: `Session not found: ${id}` } },
    { status: 404 },
  );
}

async function guard(id: string, fn: (ctx: VaultCtx) => Response): Promise<Response> {
  try {
    const ctx = await requireVault();
    return await fn(ctx);
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof Error && /^Session not found/.test(e.message)) return notFound(id);
    return internalResponse(e);
  }
}

/**
 * GET   /api/chat/sessions/:id → {session, messages}
 * PATCH /api/chat/sessions/:id {"title"?, "model"?, "providerId"?}
 * DELETE /api/chat/sessions/:id
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  return guard(id, (ctx) =>
    Response.json({
      session: getSession(ctx, id),
      messages: listMessages(ctx, id),
    }),
  );
}

const PatchBody = z.object({
  title: z.string().max(120).optional(),
  model: z.string().min(1).optional(),
  providerId: z.number().int().positive().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  const body = PatchBody.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: { code: "invalid_body", message: "Bad patch body" } },
      { status: 400 },
    );
  return guard(id, (ctx) => {
    const s = getSession(ctx, id);
    if (body.data.title !== undefined) renameSession(ctx, id, body.data.title);
    const now = Date.now();
    if (body.data.model !== undefined || body.data.providerId !== undefined) {
      ctx.db
        .prepare(
          "UPDATE chat_sessions SET model = ?, provider_id = ?, updated_at = ? WHERE id = ?",
        )
        .run(
          body.data.model ?? s.model,
          body.data.providerId === undefined ? s.providerId : body.data.providerId,
          now,
          id,
        );
    }
    return Response.json({ session: getSession(ctx, id) });
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  return guard(id, (ctx) => {
    deleteSession(ctx, id);
    return Response.json({ ok: true });
  });
}
