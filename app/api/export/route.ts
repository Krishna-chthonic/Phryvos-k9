/**
 * P7: export API — importers: components/settings/BackupPanel.tsx line N (trigger button).
 * No existing file serves this purpose (verified: grep of app/api/ found no export/backup routes).
 * Writes: backups table (id, kind, path, size_bytes INTEGER, created_at INTEGER UTC ms).
 * User instruction verbatim: "continue"
 */
import { requireVault } from "@/server/vault-guard";
import { createExportBundle } from "@/lib/backup-service";

export async function POST(req: Request) {
  await requireVault();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return Response.json({ error: { code: "invalid_body", message: "Bad request body" } }, { status: 400 });
  const kind: "auto" | "manual" | "export" = body.kind === "auto" ? "auto" : body.kind === "manual" ? "manual" : "export";
  const result = await createExportBundle(kind);
  return Response.json({ result }, { status: 201 });
}
