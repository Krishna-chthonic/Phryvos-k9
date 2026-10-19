import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { randomBytes } from "node:crypto";

interface PairingSession {
  code: string;
  deviceName: string;
  createdAt: number;
  expiresAt: number;
  pairedAt?: number;
  peerToken?: string;
}

// In-memory pairing sessions
const g = globalThis as unknown as {
  __phryvosPairingSessions?: Map<string, PairingSession>;
};
const pairingSessions = (g.__phryvosPairingSessions ??= new Map());

/**
 * GET /api/sync/pair
 * Returns active pairing status and registered peer devices
 */
export async function GET(_req: Request) {
  try {
    await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }

  const now = Date.now();
  const activeCodes: Array<{ code: string; expiresAt: number; remainingSecs: number }> = [];

  for (const [code, s] of pairingSessions.entries()) {
    if (s.expiresAt > now && !s.pairedAt) {
      activeCodes.push({
        code,
        expiresAt: s.expiresAt,
        remainingSecs: Math.max(0, Math.floor((s.expiresAt - now) / 1000)),
      });
    }
  }

  return Response.json({
    activeCodes,
    totalSessions: pairingSessions.size,
  });
}

/**
 * POST /api/sync/pair
 * Actions:
 * - { action: "generate_code", deviceName?: string }
 * - { action: "pair_device", code: string, peerDeviceName: string }
 */
export async function POST(req: Request) {
  try {
    await requireVault();
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }

  const body = await req.json().catch(() => ({}));
  const { action, code, deviceName, peerDeviceName } = body;
  const now = Date.now();

  if (action === "generate_code") {
    // Generate a 6-digit numeric pairing PIN
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const session: PairingSession = {
      code: pin,
      deviceName: deviceName || "Local Workstation",
      createdAt: now,
      expiresAt: now + 5 * 60 * 1000, // 5 minute TTL
    };
    pairingSessions.set(pin, session);

    return Response.json({
      ok: true,
      code: pin,
      expiresInSeconds: 300,
    });
  }

  if (action === "pair_device") {
    if (!code) {
      return Response.json({ error: "Code is required" }, { status: 400 });
    }

    const session = pairingSessions.get(String(code));
    if (!session || session.expiresAt < now) {
      return Response.json(
        { error: "Invalid or expired pairing code" },
        { status: 400 }
      );
    }

    const peerToken = randomBytes(24).toString("hex");
    session.pairedAt = now;
    session.peerToken = peerToken;

    return Response.json({
      ok: true,
      message: `Successfully paired with ${session.deviceName}`,
      peerDevice: peerDeviceName || "Remote Mobile Device",
      peerToken,
    });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
