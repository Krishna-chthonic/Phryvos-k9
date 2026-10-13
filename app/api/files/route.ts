import { z } from "zod";
import { vaultRoute } from "@/server/vault-guard";
import { createDir, createFile, deleteFile, listDir, listTrash } from "@/lib/vault-service";

/**
 * GET  /api/files?path=/notes      → direct children
 * POST /api/files {path, type}     → create file or directory
 * DELETE /api/files?path=          → soft delete (trash)
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  if (sp.get("trash") === "1")
    return vaultRoute(({ db, key }) =>
      Response.json({ children: listTrash({ db, key }) }),
    );
  const path = sp.get("path") ?? "/";
  return vaultRoute(({ db, key }) =>
    Response.json({ children: listDir({ db, key }, path) }),
  );
}

const CreateBody = z.object({
  path: z.string(),
  type: z.enum(["file", "dir"]).default("file"),
});

export async function POST(req: Request) {
  const body = CreateBody.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: { code: "invalid_body", message: "Bad {path, type} body" } },
      { status: 400 },
    );
  return vaultRoute(({ db, key }) => {
    const ctx = { db, key };
    const meta =
      body.data.type === "dir"
        ? createDir(ctx, body.data.path)
        : createFile(ctx, body.data.path);
    return Response.json({ meta });
  });
}

export async function DELETE(req: Request) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path)
    return Response.json(
      { error: { code: "invalid_body", message: "?path= required" } },
      { status: 400 },
    );
  return vaultRoute(({ db, key }) => {
    deleteFile({ db, key }, path);
    return Response.json({ ok: true });
  });
}
