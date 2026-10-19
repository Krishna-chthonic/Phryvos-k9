import { z } from "zod";
import {
  internalResponse,
  requireVault,
  vaultGuardResponse,
} from "@/server/vault-guard";
import {
  deleteProvider,
  getProviderMeta,
  updateProvider,
  type ProviderInput,
  type VaultCtx,
} from "@/lib/providers-service";

/**
 * GET   /api/providers/:id → meta (key never returned)
 * PATCH /api/providers/:id → update (supplied apiKey re-encrypted under the master key)
 * DELETE /api/providers/:id → remove; chat sessions are detached, not lost
 */

function notFound(id: number): Response {
  return Response.json(
    { error: { code: "not_found", message: `Provider not found: ${id}` } },
    { status: 404 },
  );
}

/** Run fn under the vault guard; 404 for unknown providers, keep 401/503 shapes. */
async function guard404(n: number, fn: (ctx: VaultCtx) => Response): Promise<Response> {
  try {
    const ctx = await requireVault();
    return await fn(ctx);
  } catch (e) {
    const authResp = vaultGuardResponse(e);
    if (authResp) return authResp;
    if (e instanceof Error && /^Provider not found/.test(e.message)) return notFound(n);
    return internalResponse(e);
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const n = Number((await params).id);
  if (!Number.isInteger(n) || n <= 0) return notFound(n);
  return guard404(n, (ctx) => Response.json({ provider: getProviderMeta(ctx, n) }));
}

const Body = z.object({
  name: z.string().min(1).max(80).optional(),
  kind: z.enum(["openai", "anthropic"]).optional(),
  baseUrl: z.string().url().optional(),
  /** non-empty string replaces the stored key; empty/omitted keeps it */
  apiKey: z.string().max(5000).optional(),
  models: z.array(z.string().min(1)).max(200).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const n = Number((await params).id);
  if (!Number.isInteger(n) || n <= 0) return notFound(n);
  const json = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (json && typeof json.baseUrl === "string") {
    let u = json.baseUrl.trim();
    if (u && !/^https?:\/\//i.test(u)) {
      u = (u.startsWith("localhost") || u.startsWith("127.0.0.1") ? "http://" : "https://") + u;
    }
    json.baseUrl = u;
  }
  const body = Body.safeParse(json);
  if (!body.success)
    return Response.json(
      {
        error: { code: "invalid_body", message: body.error.issues[0]?.message ?? "Bad body" },
      },
      { status: 400 },
    );
  const input = body.data as Partial<ProviderInput>;
  return guard404(n, (ctx) => Response.json({ provider: updateProvider(ctx, n, input) }));
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const n = Number((await params).id);
  if (!Number.isInteger(n) || n <= 0) return notFound(n);
  return guard404(n, (ctx) => {
    deleteProvider(ctx, n);
    return Response.json({ ok: true });
  });
}
