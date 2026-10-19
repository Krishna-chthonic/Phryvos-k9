import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { readFile, writeFile, deleteFile, listDir, FileMeta } from "@/lib/vault-service";

interface SyncFilePayload {
  path: string;
  dataBase64: string;
  version: number;
  updatedAt: number;
  isDeleted?: boolean;
}

/**
 * POST /api/sync/delta
 * Body: { sinceTimestamp: number }
 * Returns delta changes since that timestamp for fast local P2P sync.
 */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }

  const body = await req.json().catch(() => ({}));
  const sinceTimestamp = Number(body.sinceTimestamp || 0);

  // Fetch files changed or deleted since timestamp
  const rows = ctx.db
    .prepare("SELECT id, path, mime, version, updated_at, deleted_at FROM files WHERE updated_at >= ?")
    .all(sinceTimestamp) as Array<{
      id: number;
      path: string;
      mime: string | null;
      version: number;
      updated_at: number;
      deleted_at: number | null;
    }>;

  const changes: SyncFilePayload[] = [];

  for (const r of rows) {
    if (r.deleted_at) {
      changes.push({
        path: r.path,
        dataBase64: "",
        version: r.version,
        updatedAt: r.updated_at,
        isDeleted: true,
      });
    } else {
      try {
        const { bytes } = readFile(ctx, r.path);
        changes.push({
          path: r.path,
          dataBase64: Buffer.from(bytes).toString("base64"),
          version: r.version,
          updatedAt: r.updated_at,
          isDeleted: false,
        });
      } catch {
        // Skip unreadable files
      }
    }
  }

  return Response.json({
    deltaCount: changes.length,
    changes,
    syncedAt: Date.now(),
  });
}

/**
 * PUT /api/sync/delta
 * Body: { updates: SyncFilePayload[] }
 * Applies incoming peer changes.
 */
export async function PUT(req: Request) {
  let ctx;
  try {
    ctx = await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }

  const body = await req.json().catch(() => ({}));
  const updates: SyncFilePayload[] = Array.isArray(body.updates) ? body.updates : [];
  let appliedCount = 0;

  for (const item of updates) {
    try {
      if (item.isDeleted) {
        deleteFile(ctx, item.path);
        appliedCount++;
      } else if (item.dataBase64) {
        const buf = Buffer.from(item.dataBase64, "base64");
        writeFile(ctx, item.path, buf, `P2P Local Sync from Peer`);
        appliedCount++;
      }
    } catch {
      // Skip conflict errors safely
    }
  }

  return Response.json({
    ok: true,
    appliedCount,
    timestamp: Date.now(),
  });
}
