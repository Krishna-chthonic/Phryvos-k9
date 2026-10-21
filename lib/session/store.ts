import { randomBytes } from "node:crypto";

/**
 * In-memory vault session store.
 *
 * The master key lives ONLY here (globalThis cache, surviving HMR) — never on
 * disk, never in cookies. A process restart always means a locked vault.
 * Sessions are idle-TTL based (sliding lock via touchSession) and swept.
 */

export interface VaultSession {
  token: string;
  masterKey: Buffer;
  expiresAt: number;
  vaultType: "real" | "decoy";
}

export const SESSION_COOKIE = "phryvos_session";

type GlobalSessions = { __phryvosSessions?: Map<string, VaultSession> };
const g = globalThis as unknown as GlobalSessions;

function store(): Map<string, VaultSession> {
  if (!g.__phryvosSessions) g.__phryvosSessions = new Map();
  return g.__phryvosSessions;
}

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store()) {
    if (now >= v.expiresAt) store().delete(k);
  }
}, 30_000);
sweep.unref();

export function createSession(
  masterKey: Buffer,
  ttlMs: number,
  vaultType: "real" | "decoy" = "real",
): string {
  const token = randomBytes(32).toString("base64url");
  store().set(token, { token, masterKey, expiresAt: Date.now() + ttlMs, vaultType });
  return token;
}

export function getSession(
  token: string | null | undefined,
): VaultSession | null {
  if (!token) return null;
  const entry = store().get(token);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    store().delete(token);
    return null;
  }
  return entry;
}

/** Sliding idle lock: extend the session's expiry on activity. */
export function touchSession(token: string, ttlMs: number): void {
  const entry = store().get(token);
  if (entry) entry.expiresAt = Date.now() + ttlMs;
}

/** Retrieve active decrypted master key for background worker loops when unlocked. */
export function getActiveMasterKey(): Buffer | null {
  const now = Date.now();
  for (const [k, v] of store()) {
    if (now < v.expiresAt) return v.masterKey;
    store().delete(k);
  }
  return null;
}

export function destroySession(token: string | null | undefined): void {
  if (token) store().delete(token);
}

/** Invalidate all active vault sessions. */
export function destroyAllSessions(): void {
  store().clear();
}

/** Test/inspection helper. */
export function sessionCount(): number {
  return store().size;
}
