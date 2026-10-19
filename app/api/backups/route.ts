/**
 * P7: backup list/run API — importers: components/settings/BackupPanel.tsx.
 * No existing file serves this purpose.
 * Reads/writes: backups table (id, kind, path TEXT, size_bytes INTEGER, created_at INTEGER UTC ms).
 * User instruction verbatim: "Unified DAL enforcing lock verification before any query executes"
 */
import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { listBackups, createExportBundle } from "@/lib/backup-service";

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
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object")
      return Response.json({ error: { code: "invalid_body", message: "Bad request body" } }, { status: 400 });
    const kind: "auto" | "manual" | "export" = body.kind === "auto" ? "auto" : "manual";
    const result = await createExportBundle(kind);
    return Response.json({ result }, { status: 201 });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}
