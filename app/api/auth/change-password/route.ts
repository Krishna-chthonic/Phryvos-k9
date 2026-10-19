/**
 * P7: change password API — importers: components/settings/ChangePasswordPanel.tsx.
 * Affected API: POST /api/auth/change-password
 * Data schemas: auth(salt BLOB, verifier BLOB), all encrypted columns re-keyed:
 *   ai_providers(api_key/key_nonce/key_tag), chat_sessions(title_enc/nonce/tag, summary_enc/nonce/tag),
 *   chat_messages(content_enc/nonce/tag), study_logs(notes_enc/nonce/tag),
 *   files(dek/dek_nonce/dek_tag — DEK envelope only)
 * User instruction verbatim: "Unified DAL enforcing lock verification before any query executes"
 */
import { z } from "zod";
import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { rekeyVault } from "@/lib/backup-service";

const Body = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function POST(req: Request) {
  try {
    await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: { code: "invalid_body", message: body.error.issues[0]?.message ?? "Bad body" } },
      { status: 400 },
    );
  try {
    const result = await rekeyVault(body.data.oldPassword, body.data.newPassword);
    return Response.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    const code = msg.includes("incorrect") ? "invalid_password" : "internal";
    return Response.json({ error: { code, message: msg } }, { status: code === "invalid_password" ? 401 : 500 });
  }
}
