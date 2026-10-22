/**
 * Vault unlock route with scrypt key derivation and duress decoy protection.
 *
 * Importers/callers: Frontend unlock form, AppShell auto-lock handler
 * Affected API: POST /api/auth/unlock
 */
import { z } from "zod";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { kvGet } from "@/lib/db/kv";
import { checkPassword, derive, splitMaster } from "@/lib/crypto/kdf";
import { sessionCookieOptions } from "@/lib/session/cookie";
import {
  ThrottleError,
  assertNotThrottled,
  recordFail,
  clearThrottle,
} from "@/lib/session/throttle";
import { createSession, SESSION_COOKIE } from "@/lib/session/store";
import { internalResponse } from "@/server/vault-guard";
import { initDecoyVault, verifyDuressPin } from "@/lib/dal/duress-vault";
import { randomBytes, createHash } from "node:crypto";

const UnlockBody = z.object({
  password: z.string().min(1),
  pin: z.string().optional(),
});

/** Verify the vault password/PIN and open an idle-TTL session. */
export async function POST(req: Request) {
  try {
    assertNotThrottled("unlock");
    const db = getDb();
    const row = db
      .prepare("SELECT kdf, salt, verifier FROM auth LIMIT 1")
      .get() as
      | { kdf: string; salt: Buffer; verifier: Buffer }
      | undefined;

    if (!row) {
      return Response.json(
        {
          error: {
            code: "setup_required",
            message: "No vault password yet — run setup first.",
          },
        },
        { status: 409 },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = UnlockBody.safeParse(body);
    if (!parsed.success) {
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

    const passwordAttempt = parsed.data.pin || parsed.data.password;

    // Duress PIN Check (if set up)
    if (verifyDuressPin(passwordAttempt)) {
      clearThrottle("unlock");
      await initDecoyVault();
      const decoyKey = randomBytes(32);
      const autoLockMinutes = Math.max(1, Number(kvGet("auto_lock_minutes") ?? 30));
      const ttlMs = autoLockMinutes * 60_000;
      const now = Date.now();
      const decoyToken = createSession(decoyKey, ttlMs, "decoy");
      const decoyTokenHash = createHash("sha256").update(decoyToken).digest("hex");
      db.prepare(
        "INSERT OR REPLACE INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)",
      ).run(decoyTokenHash, now, now + ttlMs);
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE, decoyToken, sessionCookieOptions(ttlMs));
      // Plausible deniability: Return identical payload, vaultType, and TTL as primary vault
      return Response.json({
        ok: true,
        success: true,
        state: "unlocked",
        vaultType: "real",
        auto_lock_minutes: autoLockMinutes,
      });
    }

    // Verify Master Password using Scrypt
    if (!checkPassword(passwordAttempt, row.salt, row.verifier)) {
      recordFail("unlock");
      return Response.json(
        { error: { code: "invalid_password", message: "Wrong password." } },
        { status: 401 },
      );
    }

    // Password verified: clear throttle strikes
    clearThrottle("unlock");

    // Derive the real AES-256 master key for decrypting files
    const { masterKey } = splitMaster(derive(passwordAttempt, row.salt));
    const autoLockMinutes = Math.max(1, Number(kvGet("auto_lock_minutes") ?? 30));
    const ttlMs = autoLockMinutes * 60_000;
    const now = Date.now();
    const token = createSession(masterKey, ttlMs, "real");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    db.prepare(
      "INSERT OR REPLACE INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)",
    ).run(tokenHash, now, now + ttlMs);

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(ttlMs));
    return Response.json({
      ok: true,
      success: true,
      state: "unlocked",
      vaultType: "real",
      auto_lock_minutes: autoLockMinutes,
    });
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
