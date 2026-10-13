import { vaultRoute } from "@/server/vault-guard";
import { search } from "@/lib/vault-service";

/** GET /api/files/search?q= → name + content FTS matches. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return vaultRoute(({ db, key }) =>
    Response.json({ hits: search({ db, key }, q) }),
  );
}
