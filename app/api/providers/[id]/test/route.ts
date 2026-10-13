import { z } from "zod";
import {
  internalResponse,
  requireVault,
  vaultGuardResponse,
} from "@/server/vault-guard";
import { createLlmClient, type VaultCtx } from "@/lib/providers-service";

/**
 * POST /api/providers/:id/test  {"model"?: "…"}
 * → {ok: true, detail} | {ok: false, detail} | 404
 * Surfaces provider quirks (Ollama strict mode, anthropic max_tokens, …)
 * at provider-configuration time instead of mid-chat.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const n = Number((await params).id);
  if (!Number.isInteger(n) || n <= 0)
    return Response.json(
      { error: { code: "not_found", message: `Provider not found: ${n}` } },
      { status: 404 },
    );
  const body = z.object({ model: z.string().min(1).optional() }).safeParse(
    await req.json().catch(() => null),
  );
  const model = body.success ? body.data.model : undefined;
  try {
    const ctx = await requireVault();
    const client = createLlmClient(ctx as VaultCtx, n);
    const res = await client.testConnection(model);
    return Response.json(res, { status: res.ok ? 200 : 424 });
  } catch (e) {
    const authResp = vaultGuardResponse(e);
    if (authResp) return authResp;
    return internalResponse(e);
  }
}
