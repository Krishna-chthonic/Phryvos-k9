/**
 * P7: backup detail/delete API — importers: components/settings/BackupPanel.tsx (delete button on each row).
 * Affected API: DELETE /api/backups/:id
 * Data schemas: backups(id INTEGER PK, kind TEXT, path TEXT, size_bytes INTEGER, created_at INTEGER UTC ms)
 * User instruction verbatim: "continue"
 */
import { requireVault } from "@/server/vault-guard";
import { deleteBackup } from "@/lib/backup-service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireVault();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json({ error: { code: "invalid", message: "Invalid backup id" } }, { status: 400 });
  deleteBackup(id);
  return Response.json({ ok: true });
}
