import { z } from "zod";
import { vaultRoute } from "@/server/vault-guard";
import { listVersions, restoreVersion } from "@/lib/vault-service";

/**
 * GET  /api/files/versions?path=          → version history (newest first)
 * POST /api/files/versions {path, version} → restore that version (writes a NEW version)
 */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path)
    return Response.json(
      { error: { code: "invalid_body", message: "?path= required" } },
      { status: 400 },
    );
  return vaultRoute(({ db, key }) =>
    Response.json({ versions: listVersions({ db, key }, path) }),
  );
}

const RestoreBody = z.object({ path: z.string(), version: z.number().int().positive() });

export async function POST(req: Request) {
  const body = RestoreBody.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: { code: "invalid_body", message: "Bad {path, version} body" } },
      { status: 400 },
    );
  return vaultRoute(({ db, key }) => {
    const meta = restoreVersion({ db, key }, body.data.path, body.data.version);
    return Response.json({ meta });
  });
}
