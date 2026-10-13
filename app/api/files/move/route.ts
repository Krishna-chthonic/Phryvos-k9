import { z } from "zod";
import { vaultRoute } from "@/server/vault-guard";
import { moveFile } from "@/lib/vault-service";

/** POST /api/files/move {from, to} → rename / move a file or whole directory. */
export async function POST(req: Request) {
  const body = z
    .object({ from: z.string(), to: z.string() })
    .safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: { code: "invalid_body", message: "Bad {from, to} body" } },
      { status: 400 },
    );
  return vaultRoute(({ db, key }) => {
    const meta = moveFile({ db, key }, body.data.from, body.data.to);
    return Response.json({ meta });
  });
}
