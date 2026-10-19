/**
 * P7: backup detail/delete API — importers: components/settings/BackupPanel.tsx (delete button on each row).
 * Affected API: DELETE /api/backups/:id
 * Data schemas: backups(id INTEGER PK, kind TEXT, path TEXT, size_bytes INTEGER, created_at INTEGER UTC ms)
 * User instruction verbatim: "Unified DAL enforcing lock verification before any query executes"
 */
import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { deleteBackup } from "@/lib/backup-service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireVault();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0)
      return Response.json({ error: { code: "invalid", message: "Invalid backup id" } }, { status: 400 });
    await deleteBackup(id);
    return Response.json({ ok: true });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}
