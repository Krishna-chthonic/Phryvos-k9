/**
 * Vault setup route with optional duress PIN.
 *
 * Importers/callers: Frontend setup form
 * Affected API: POST /api/auth/setup - accepts password and optional duress PIN
 * Data schemas: SetupBody (password, optional duressPin)
 * User instruction verbatim: "Duress Ghost Vault & isolated decoy database (vault_decoy.db)"
 */
import { z } from "zod";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { kvSet } from "@/lib/db/kv";

import { DEFAULT_SYSTEM_PROMPT } from "@/lib/defaults";
import { sessionCookieOptions } from "@/lib/session/cookie";
import {
  ThrottleError,
  assertNotThrottled,
  recordFail,
  clearThrottle,
} from "@/lib/session/throttle";
import { createSession, SESSION_COOKIE } from "@/lib/session/store";
import { internalResponse } from "@/server/vault-guard";
import { setupVault } from "@/lib/dal/duress-vault";

const SetupBody = z.object({
  password: z.string().min(8, "Password must be at least 8 characters."),
  duressPin: z.string().optional(), // Optional duress PIN for decoy vault
});

/**
 * First-run only: create the vault password (scrypt → master key + verifier),
 * seed defaults, and open the first session. 409 if a password already exists.
 * Optionally accepts a duress PIN for the decoy vault.
 */
export async function POST(req: Request) {
  try {
    assertNotThrottled("setup");
    const db = getDb();
    if (db.prepare("SELECT 1 FROM auth LIMIT 1").get()) {
      recordFail("setup");
      return Response.json(
        {
          error: {
            code: "already_set",
            message: "A vault password already exists — unlock instead.",
          },
        },
        { status: 409 },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = SetupBody.safeParse(body);
    if (!parsed.success) {
      recordFail("setup");
      return Response.json(
        {
          error: {
            code: "invalid_body",
            message: parsed.error.issues[0]?.message ?? "Invalid body.",
          },
        },
        { status: 400 },
      );
    }

    // Use the canonical setupVault function that writes kdf, salt, verifier and returns masterKey
    const { masterKey } = await setupVault(parsed.data.password, parsed.data.duressPin);

    kvSet("system_prompt", DEFAULT_SYSTEM_PROMPT);
    kvSet("auto_lock_minutes", "30");

    // Setup succeeded: clear throttle strikes
    clearThrottle("setup");

    // Open initial session using the exact same masterKey derived from stored salt
    const ttlMs = 30 * 60_000;
    const token = createSession(masterKey, ttlMs);
    const now = Date.now();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    db.prepare(
      "INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)",
    ).run(tokenHash, now, now + ttlMs);

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(ttlMs));
    return Response.json({ ok: true, success: true, state: "unlocked" });
  } catch (e) {
    if (e instanceof ThrottleError) {
      return Response.json(
        { error: { code: "throttled", message: e.message } },
        { status: 429 },
      );
    }
    return internalResponse(e);
  }
}
