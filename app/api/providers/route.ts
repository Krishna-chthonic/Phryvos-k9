import { z } from "zod";
import { vaultRoute } from "@/server/vault-guard";
import { createProvider, listProviders, type ProviderInput } from "@/lib/providers-service";

/**
 * GET  /api/providers            → list (keys never returned)
 * POST /api/providers            → create
 */
export async function GET() {
  return vaultRoute(({ db, key }) =>
    Response.json({ providers: listProviders({ db, key }) }),
  );
}

const Body = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["openai", "anthropic"]),
  baseUrl: z.string().url(),
  apiKey: z.string().max(5000).optional(),
  models: z.array(z.string().min(1)).max(200).optional(),
  isDefault: z.boolean().optional(),
});

export async function POST(req: Request) {
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
      { error: { code: "invalid_body", message: body.error.issues[0]?.message ?? "Bad body" } },
      { status: 400 },
    );
  return vaultRoute(({ db, key }) => {
    const meta = createProvider({ db, key }, body.data as ProviderInput);
    return Response.json({ provider: meta }, { status: 201 });
  });
}
