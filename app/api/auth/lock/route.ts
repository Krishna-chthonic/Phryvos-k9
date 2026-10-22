import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { sessionCookieClearOptions } from "@/lib/session/cookie";
import { destroySession, SESSION_COOKIE } from "@/lib/session/store";
import { internalResponse } from "@/server/vault-guard";

/** Lock the vault now: drop the in-memory session and clear the cookie. */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    destroySession(token);
    if (token) {
      const hash = createHash("sha256").update(token).digest("hex");
      getDb().prepare("DELETE FROM sessions WHERE token = ? OR token = ?").run(token, hash);
    }
    cookieStore.delete(SESSION_COOKIE);
    return Response.json({ ok: true, state: "locked" });
  } catch (e) {
    return internalResponse(e);
  }
}
