import { cookies } from "next/headers";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/client";
import { kvGet } from "@/lib/db/kv";
import {
  getSession,
  SESSION_COOKIE,
  touchSession,
} from "@/lib/session/store";
import { VaultError } from "@/lib/vault-service";

export class VaultAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface VaultContext {
  db: Database.Database;
  key: Buffer;
  token: string;
}

/**
 * Guard every vault API route: resolves the in-memory session → master key.
 * 401 = no session cookie; 503 = session expired/missing (vault locked).
 * Also refreshes the sliding idle-lock window on every request.
 */
export async function requireVault(): Promise<VaultContext> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = getSession(token);
  if (!token) {
    throw new VaultAuthError(401, "auth_required", "No vault session — unlock the vault first.");
  }
  if (!session) {
    throw new VaultAuthError(503, "vault_locked", "Vault session expired or locked.");
  }
  const ttlMs = Math.max(1, Number(kvGet("auto_lock_minutes") ?? 30)) * 60_000;
  touchSession(token, ttlMs);
  const db = getDb();
  return { db, key: session.masterKey, token };
}

export function vaultGuardResponse(e: unknown): Response | null {
  if (e instanceof VaultAuthError) {
    const body =
      e.status === 503
        ? JSON.stringify({ locked: true })
        : JSON.stringify({ error: { code: e.code, message: e.message } });
    return new Response(body, {
      status: e.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

export function internalResponse(e: unknown): Response {
  const message = e instanceof Error ? e.message : "Internal error";
  return new Response(
    JSON.stringify({ error: { code: "internal", message } }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );
}

const VAULT_ERROR_STATUS: Record<VaultError["code"], number> = {
  not_found: 404,
  exists: 409,
  not_a_file: 409,
  not_a_dir: 409,
  path_invalid: 400,
  too_large: 413,
};

/**
 * Standard vault route wrapper: require the session, run fn with the
 * {db, key} context, and map auth/vault errors to JSON responses.
 */
export async function vaultRoute<T>(
  fn: (ctx: VaultContext) => T | Promise<T>,
): Promise<Response> {
  try {
    const ctx = await requireVault();
    return (await fn(ctx)) as Response;
  } catch (e) {
    const authResp = vaultGuardResponse(e);
    if (authResp) return authResp;
    if (e instanceof VaultError) {
      return Response.json(
        { error: { code: e.code, message: e.message } },
        { status: VAULT_ERROR_STATUS[e.code] },
      );
    }
    return internalResponse(e);
  }
}
