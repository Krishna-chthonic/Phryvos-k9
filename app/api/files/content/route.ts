import { z } from "zod";
import { vaultRoute } from "@/server/vault-guard";
import { readFile, writeFile } from "@/lib/vault-service";

/**
 * GET /api/files/content?path=   → decrypted bytes (streamed, correct mime)
 *
 * PUT /api/files/content?path=&note=
 *   - raw body (any content-type)  → written verbatim
 *   - application/json {dataBase64} → decoded then written
 * Both auto-snapshot the previous version (vault-service).
 */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path)
    return Response.json(
      { error: { code: "invalid_body", message: "?path= required" } },
      { status: 400 },
    );
  return vaultRoute(({ db, key }) => {
    const { bytes, mime } = readFile({ db, key }, path);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime ?? "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
      },
    });
  });
}

const JsonBody = z.object({ dataBase64: z.string() });

export async function PUT(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  const note = url.searchParams.get("note") ?? undefined;
  if (!path)
    return Response.json(
      { error: { code: "invalid_body", message: "?path= required" } },
      { status: 400 },
    );
  const isJson = (req.headers.get("content-type") ?? "").includes("application/json");
  let bytes: Buffer;
  if (isJson) {
    const body = JsonBody.safeParse(await req.json().catch(() => null));
    if (!body.success)
      return Response.json(
        { error: { code: "invalid_body", message: "Bad {dataBase64} body" } },
        { status: 400 },
      );
    bytes = Buffer.from(body.data.dataBase64, "base64");
  } else {
    bytes = Buffer.from(await req.arrayBuffer());
  }
  return vaultRoute(({ db, key }) => {
    const meta = writeFile({ db, key }, path, bytes, note);
    return Response.json({ meta });
  });
}
