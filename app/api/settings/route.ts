import { z } from "zod";
import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { kvGet, kvSet } from "@/lib/db/kv";

/**
 * The user's global system prompt, applied to every chat.
 *   GET /api/settings → {systemPrompt: string | null}
 *   PUT /api/settings {"systemPrompt": "..."} → {ok: true}
 */

export async function GET(_req: Request) {
  try {
    await requireVault();
    return Response.json({ systemPrompt: kvGet("system_prompt") });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }

  const body = z
    .object({ systemPrompt: z.string().max(8_000) })
    .safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: { code: "invalid_body", message: "systemPrompt must be a string (≤ 8000 chars)" } },
      { status: 400 },
    );

  const prompt = body.data.systemPrompt.trim();
  if (prompt) kvSet("system_prompt", prompt);
  else {
    // empty ⇒ clear the key so chats fall back to the built-in prompt
    kvSet("system_prompt", "");
  }
  return Response.json({ ok: true });
}
