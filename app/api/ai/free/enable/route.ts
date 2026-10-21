import { NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { setFreeProviderAsDefault } from "@/lib/ai/free-frontier-service";

export async function POST() {
  return vaultRoute(({ db, key }) => {
    setFreeProviderAsDefault({ db, key });
    return NextResponse.json({
      success: true,
      message: "Phryvos Free Frontier (Zero-Config) is now your active default AI provider.",
    });
  });
}
