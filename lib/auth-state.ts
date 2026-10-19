import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { getSession, SESSION_COOKIE } from "@/lib/session/store";

export type VaultState = "setup_required" | "locked" | "unlocked";

/**
 * Public (pre-unlock) vault state probe, used by /, /unlock, /setup and the
 * lock watchdog. Works even when the password has not been set yet.
 */
let cachedHasAuth: boolean | null = null;

export async function getVaultState(): Promise<VaultState> {
  if (!cachedHasAuth) {
    const db = getDb();
    cachedHasAuth = !!db.prepare("SELECT 1 FROM auth LIMIT 1").get();
    if (!cachedHasAuth) return "setup_required";
  }
  const cookieStore = await cookies();
  return getSession(cookieStore.get(SESSION_COOKIE)?.value)
    ? "unlocked"
    : "locked";
}
