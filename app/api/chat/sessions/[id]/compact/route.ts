/**
 * Session compaction route for phryvos-k9.
 *
 * Importers/callers: components/chat/ChatApp.tsx (compact button)
 * Affected API: POST /api/chat/sessions/[id]/compact
 * Data schemas if any: chat_sessions table (summary_enc, summary_nonce, summary_tag, summary_until)
 * User instruction verbatim: "2. agar isme compaction ka system hota toh thik rahta like koi session jyada lamba ho gaya toh dikkat ho sakti hai"
 */
import {
  internalResponse,
  requireVault,
  vaultGuardResponse,
} from "@/server/vault-guard";
import { getSession } from "@/lib/chat-service";
import { createLlmClient, defaultProvider, type VaultCtx } from "@/lib/providers-service";
import { compactSession } from "@/lib/ai/summarize";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionId = (await params).id;
  try {
    const vctx = await requireVault();
    const ctx: VaultCtx = { db: vctx.db, key: vctx.key };
    const session = getSession(ctx, sessionId);

    let providerId = session.providerId ?? defaultProvider(ctx)?.id;
    if (!providerId) {
      return Response.json(
        {
          error: {
            code: "no_provider",
            message: "No AI provider configured. Add one in Settings → Providers first.",
          },
        },
        { status: 400 },
      );
    }

    const client = createLlmClient(ctx, providerId);
    const result = await compactSession(ctx, client, session.model, sessionId);

    return Response.json({
      ok: true,
      summary: result.summary,
      compactedCount: result.compactedCount,
    });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof Error && /^Session not found/.test(e.message)) {
      return Response.json(
        { error: { code: "not_found", message: e.message } },
        { status: 404 },
      );
    }
    return internalResponse(e);
  }
}
