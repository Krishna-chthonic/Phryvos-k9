import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { getSession, SESSION_COOKIE, sessionCount } from "@/lib/session/store";

export type VaultState = "setup_required" | "locked" | "unlocked";

/**
 * Public (pre-unlock) vault state probe, used by /, /unlock, /setup and the
 * lock watchdog. Works even when the password has not been set yet.
 */
export async function getVaultState(): Promise<VaultState> {
  const db = getDb();
  const hasAuth = !!db.prepare("SELECT 1 FROM auth LIMIT 1").get();
  if (!hasAuth) return "setup_required";

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    return getSession(token) ? "unlocked" : "locked";
  } catch {
    // In node test runners or CLI environment outside Next.js request context
    return sessionCount() > 0 ? "unlocked" : "locked";
  }
}
