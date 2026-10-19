/**
 * P7: backup restore API — importers: components/settings/BackupPanel.tsx.
 * No existing file serves this purpose.
 * Reads: backup zip file from disk; replaces vault.db entirely.
 * User instruction verbatim: "Unified DAL enforcing lock verification before any query executes"
 */
import { requireVault } from "@/server/vault-guard";
import { restoreBackup } from "@/lib/backup-service";

export async function POST(req: Request) {
  await requireVault();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.path !== "string")
    return Response.json({ error: { code: "invalid_body", message: "path field required" } }, { status: 400 });
  const result = await restoreBackup(body.path);
  return Response.json({ result });
}
