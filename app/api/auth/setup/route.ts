import { z } from "zod";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db/client";
import { kvSet } from "@/lib/db/kv";
import { KDF_ID, derive, newSalt, splitMaster } from "@/lib/crypto/kdf";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/defaults";
import { sessionCookieOptions } from "@/lib/session/cookie";
import { ThrottleError, assertNotThrottled } from "@/lib/session/throttle";
import { createSession, SESSION_COOKIE } from "@/lib/session/store";
import { internalResponse } from "@/server/vault-guard";

const SetupBody = z.object({
  password: z.string().min(8, "Password must be at least 8 characters."),
});

/**
 * First-run only: create the vault password (scrypt → master key + verifier),
 * seed defaults, and open the first session. 409 if a password already exists.
 */
export async function POST(req: Request) {
  try {
    assertNotThrottled("setup");
    const db = getDb();
    if (db.prepare("SELECT 1 FROM auth LIMIT 1").get()) {
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

    const salt = newSalt();
    const { masterKey, verifier } = splitMaster(
      derive(parsed.data.password, salt),
    );
    const now = Date.now();
    db.prepare(
      "INSERT INTO auth (id, kdf, salt, verifier, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(1, KDF_ID, salt, verifier, now);

    kvSet("system_prompt", DEFAULT_SYSTEM_PROMPT);
    kvSet("auto_lock_minutes", "30");

    const ttlMs = 30 * 60_000;
    const token = createSession(masterKey, ttlMs);
    db.prepare(
      "INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)",
    ).run(token, now, now + ttlMs);

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(ttlMs));
    return Response.json({ ok: true, state: "unlocked" });
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
