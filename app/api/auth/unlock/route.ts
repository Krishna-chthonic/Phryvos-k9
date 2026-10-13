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
} from "@/lib/session/throttle";
import { createSession, SESSION_COOKIE } from "@/lib/session/store";
import { internalResponse } from "@/server/vault-guard";

const UnlockBody = z.object({ password: z.string().min(1) });

/** Verify the vault password and open an idle-TTL session. */
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

    if (!checkPassword(parsed.data.password, row.salt, row.verifier)) {
      recordFail("unlock");
      return Response.json(
        { error: { code: "invalid_password", message: "Wrong password." } },
        { status: 401 },
      );
    }

    const { masterKey } = splitMaster(derive(parsed.data.password, row.salt));
    const autoLockMinutes = Math.max(1, Number(kvGet("auto_lock_minutes") ?? 30));
    const ttlMs = autoLockMinutes * 60_000;
    const now = Date.now();
    const token = createSession(masterKey, ttlMs);
    db.prepare(
      "INSERT OR REPLACE INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)",
    ).run(token, now, now + ttlMs);

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(ttlMs));
    return Response.json({
      ok: true,
      state: "unlocked",
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
