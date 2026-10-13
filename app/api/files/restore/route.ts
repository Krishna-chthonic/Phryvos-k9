import { vaultRoute } from "@/server/vault-guard";
import { restoreFile } from "@/lib/vault-service";

/** POST /api/files/restore?path= → undo a soft delete (trash → back). */
export async function POST(req: Request) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path)
    return Response.json(
      { error: { code: "invalid_body", message: "?path= required" } },
      { status: 400 },
    );
  return vaultRoute(({ db, key }) => {
    restoreFile({ db, key }, path);
    return Response.json({ ok: true });
  });
}
