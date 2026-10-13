import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { kvGet } from "@/lib/db/kv";
import { getSession, SESSION_COOKIE } from "@/lib/session/store";
import { internalResponse } from "@/server/vault-guard";

/**
 * Public state probe (no guard): setup_required | locked | unlocked.
 * Also reaps expired session rows.
 */
export async function GET() {
  try {
    const db = getDb();
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
    const hasAuth = !!db.prepare("SELECT 1 FROM auth LIMIT 1").get();
    const cookieStore = await cookies();
    const unlocked = hasAuth && !!getSession(cookieStore.get(SESSION_COOKIE)?.value);
    return Response.json({
      state: !hasAuth ? "setup_required" : unlocked ? "unlocked" : "locked",
      auto_lock_minutes: hasAuth
        ? Math.max(1, Number(kvGet("auto_lock_minutes") ?? 30))
        : 30,
    });
  } catch (e) {
    return internalResponse(e);
  }
}
