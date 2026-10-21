import { NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import {
  FREE_FRONTIER_MODELS,
  getAllGatewaysHealth,
  ensureFreeProviderConfigured,
} from "@/lib/ai/free-frontier-service";

export async function GET() {
  const gateways = await getAllGatewaysHealth();

  return vaultRoute(({ db, key }) => {
    const providerInfo = ensureFreeProviderConfigured({ db, key });

    return NextResponse.json({
      gateways,
      models: FREE_FRONTIER_MODELS,
      providerId: providerInfo.id,
      isDefault: providerInfo.isDefault,
    });
  });
}
