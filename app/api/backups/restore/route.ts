/**
 * P7: backup restore API — importers: components/settings/BackupPanel.tsx.
 * No existing file serves this purpose.
 * Reads: backup zip file from disk; replaces vault.db entirely.
 * User instruction verbatim: "Unified DAL enforcing lock verification before any query executes"
 */
import path from "node:path";
import { requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { restoreBackup } from "@/lib/backup-service";

export async function POST(req: Request) {
  try {
    await requireVault();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.path !== "string" || !body.path.trim()) {
      return Response.json({ error: { code: "invalid_body", message: "path field required" } }, { status: 400 });
    }

    const rawPath = body.path.trim();
    if (rawPath.includes("\0") || !rawPath.toLowerCase().endsWith(".zip")) {
      return Response.json({ error: { code: "invalid_path", message: "Invalid backup file path" } }, { status: 400 });
    }

    const resolved = path.resolve(rawPath);
    const result = await restoreBackup(resolved);
    return Response.json({ result });
  } catch (err) {
    const auth = vaultGuardResponse(err);
    if (auth) return auth;
    return Response.json(
      { error: { code: "restore_failed", message: err instanceof Error ? err.message : String(err) } },
      { status: 500 }
    );
  }
}
