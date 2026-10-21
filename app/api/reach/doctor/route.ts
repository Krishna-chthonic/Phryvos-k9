import { NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { runAgentReachDoctor } from "@/lib/agent/reach-service";

export async function GET() {
  return vaultRoute(async () => {
    const report = await runAgentReachDoctor();
    return NextResponse.json({ report });
  });
}
