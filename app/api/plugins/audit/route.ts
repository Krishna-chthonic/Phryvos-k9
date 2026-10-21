import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { getRecentAuditTraces, clearAuditTraces } from "@/lib/plugins/audit-tracer";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
  const dotName = searchParams.get("dot") || undefined;
  const sessionId = searchParams.get("session") || undefined;

  return vaultRoute(() => {
    const traces = getRecentAuditTraces(limit, { dotName, sessionId });
    return NextResponse.json({
      traces,
      totalCount: traces.length,
    });
  });
}

export async function DELETE() {
  return vaultRoute(() => {
    clearAuditTraces();
    return NextResponse.json({ success: true, message: "Audit buffer cleared." });
  });
}
