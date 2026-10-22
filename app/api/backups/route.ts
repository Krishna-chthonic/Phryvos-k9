/**
 * P7: backup list/run API — importers: components/settings/BackupPanel.tsx.
 * No existing file serves this purpose.
 * Reads/writes: backups table (id, kind, path TEXT, size_bytes INTEGER, created_at INTEGER UTC ms).
 * User instruction verbatim: "Unified DAL enforcing lock verification before any query executes"
 */
import { z } from "zod";
import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { listBackups, createExportBundle } from "@/lib/backup-service";

const CreateBackupBody = z.object({
  kind: z.enum(["auto", "manual", "export"]).default("manual"),
});

export async function GET() {
  try {
    await requireVault();
    return Response.json({ backups: await listBackups() });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireVault();
    const raw = await req.json().catch(() => ({}));
    const parsed = CreateBackupBody.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: { code: "invalid_body", message: parsed.error.issues[0]?.message ?? "Invalid kind" } },
        { status: 400 },
      );
    }
    const result = await createExportBundle(parsed.data.kind);
    return Response.json({ result }, { status: 201 });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}
