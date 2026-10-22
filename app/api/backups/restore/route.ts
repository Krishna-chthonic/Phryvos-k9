/**
 * P7: backup restore API — importers: components/settings/BackupPanel.tsx.
 * No existing file serves this purpose.
 * Reads: backup zip file from disk; replaces vault.db entirely.
 * User instruction verbatim: "Unified DAL enforcing lock verification before any query executes"
 */
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { restoreBackup, listBackups, BACKUPS_DIR, EXPORT_DIR } from "@/lib/backup-service";

const RestoreBody = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  path: z.string().optional(),
});

function isContainedIn(childPath: string, parentDir: string): boolean {
  const relative = path.relative(parentDir, childPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function POST(req: Request) {
  try {
    await requireVault();
    const raw = await req.json().catch(() => null);
    const parsed = RestoreBody.safeParse(raw);
    if (!parsed.success || (!parsed.data.id && !parsed.data.path)) {
      return Response.json(
        { error: { code: "invalid_body", message: "Either 'id' or 'path' field is required" } },
        { status: 400 },
      );
    }

    let targetPath: string | null = null;

    if (parsed.data.id !== undefined) {
      const allBackups = await listBackups();
      const matched = allBackups.find(
        (b) => String(b.id) === String(parsed.data.id),
      );
      if (!matched) {
        return Response.json(
          { error: { code: "not_found", message: `Backup with id ${parsed.data.id} not found` } },
          { status: 404 },
        );
      }
      targetPath = matched.path;
    } else if (parsed.data.path) {
      const rawPath = parsed.data.path.trim();
      if (rawPath.includes("\0") || !rawPath.toLowerCase().endsWith(".zip")) {
        return Response.json(
          { error: { code: "invalid_path", message: "Invalid backup file path" } },
          { status: 400 },
        );
      }
      targetPath = path.resolve(rawPath);
    }

    if (!targetPath) {
      return Response.json(
        { error: { code: "invalid_path", message: "Could not resolve backup target" } },
        { status: 400 },
      );
    }

    // Security Confinement: Verify file exists and is not a broken pointer
    if (!fs.existsSync(targetPath)) {
      return Response.json(
        { error: { code: "not_found", message: "Backup file does not exist" } },
        { status: 404 },
      );
    }

    // Resolve real canonical path to defeat symlink directory escapes
    const canonicalTarget = fs.realpathSync(targetPath);
    const canonicalBackupsDir = fs.existsSync(BACKUPS_DIR) ? fs.realpathSync(BACKUPS_DIR) : path.resolve(BACKUPS_DIR);
    const canonicalExportsDir = fs.existsSync(EXPORT_DIR) ? fs.realpathSync(EXPORT_DIR) : path.resolve(EXPORT_DIR);

    const isSafe =
      isContainedIn(canonicalTarget, canonicalBackupsDir) ||
      isContainedIn(canonicalTarget, canonicalExportsDir);

    if (!isSafe) {
      return Response.json(
        {
          error: {
            code: "path_forbidden",
            message: "Access denied: Restores are strictly restricted to approved backups/exports directories",
          },
        },
        { status: 403 },
      );
    }

    const stat = fs.statSync(canonicalTarget);
    if (!stat.isFile()) {
      return Response.json(
        { error: { code: "invalid_file", message: "Specified target is not a valid file" } },
        { status: 400 },
      );
    }

    const result = await restoreBackup(canonicalTarget);
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
