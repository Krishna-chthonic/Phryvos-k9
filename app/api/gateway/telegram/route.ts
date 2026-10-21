import { z } from "zod";
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import {
  getGatewayConfig,
  updateGatewayConfig,
  listTelegramUsers,
  approvePairing,
  revokeTelegramUser,
  telegramGateway,
} from "@/lib/gateway/telegram-gateway";

const ActionSchema = z.object({
  action: z.enum([
    "start",
    "stop",
    "update_config",
    "approve_user",
    "revoke_user",
    "test_ping",
  ]),
  botToken: z.string().optional(),
  enabled: z.boolean().optional(),
  dmPolicy: z.enum(["pairing", "allowlist", "open"]).optional(),
  codeOrId: z.string().optional(),
  telegramId: z.string().optional(),
});

export async function GET() {
  try {
    const ctx = await requireVault();
    const config = getGatewayConfig(ctx.db);
    const users = listTelegramUsers(ctx.db);

    return Response.json({
      config: {
        botToken: config.botToken ? `${config.botToken.slice(0, 6)}...${config.botToken.slice(-4)}` : "",
        hasToken: Boolean(config.botToken),
        enabled: config.enabled,
        dmPolicy: config.dmPolicy,
        updatedAt: config.updatedAt,
      },
      users,
      isRunning: telegramGateway.isRunning(),
      lastPollTime: telegramGateway.getLastPollTime(),
    });
  } catch (e) {
    const guarded = vaultGuardResponse(e);
    if (guarded) return guarded;
    return internalResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireVault();
    const body = await req.json();
    const parsed = ActionSchema.parse(body);

    switch (parsed.action) {
      case "update_config": {
        const updated = updateGatewayConfig(ctx.db, {
          botToken: parsed.botToken,
          enabled: parsed.enabled,
          dmPolicy: parsed.dmPolicy,
        });
        if (updated.enabled && updated.botToken) {
          await telegramGateway.start(ctx.db, updated.botToken);
        } else if (!updated.enabled) {
          telegramGateway.stop();
        }
        return Response.json({ success: true, config: updated, isRunning: telegramGateway.isRunning() });
      }

      case "start": {
        const config = getGatewayConfig(ctx.db);
        if (!config.botToken) {
          return Response.json({ error: { message: "Bot token not configured" } }, { status: 400 });
        }
        updateGatewayConfig(ctx.db, { enabled: true });
        await telegramGateway.start(ctx.db, config.botToken);
        return Response.json({ success: true, isRunning: true });
      }

      case "stop": {
        updateGatewayConfig(ctx.db, { enabled: false });
        telegramGateway.stop();
        return Response.json({ success: true, isRunning: false });
      }

      case "approve_user": {
        if (!parsed.codeOrId) {
          return Response.json({ error: { message: "codeOrId required" } }, { status: 400 });
        }
        const res = approvePairing(ctx.db, parsed.codeOrId);
        return Response.json(res);
      }

      case "revoke_user": {
        if (!parsed.telegramId) {
          return Response.json({ error: { message: "telegramId required" } }, { status: 400 });
        }
        revokeTelegramUser(ctx.db, parsed.telegramId);
        return Response.json({ success: true });
      }

      case "test_ping": {
        const config = getGatewayConfig(ctx.db);
        if (!config.botToken) {
          return Response.json({ error: { message: "Bot token not configured" } }, { status: 400 });
        }
        if (!parsed.telegramId) {
          return Response.json({ error: { message: "telegramId required" } }, { status: 400 });
        }
        const sent = await telegramGateway.sendPush(
          config.botToken,
          parsed.telegramId,
          "🚀 *Phryvos-K9 Test Ping*\nYour remote Telegram Gateway connection is active and working!",
        );
        return Response.json({ success: sent });
      }
    }
  } catch (e) {
    const guarded = vaultGuardResponse(e);
    if (guarded) return guarded;
    return internalResponse(e);
  }
}
