import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { paperclipEngine } from "@/lib/paperclip/paperclip-engine";

export async function GET() {
  return vaultRoute(() => {
    return NextResponse.json({
      success: true,
      company: paperclipEngine.getState(),
    });
  });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  return vaultRoute(async () => {
    try {
      if (json.action === "record_spend") {
        if (!json.memberId) throw new Error("Missing 'memberId' parameter");
        const res = paperclipEngine.recordExpenditure(
          json.memberId,
          Number(json.tokens || 0),
          Number(json.costUsd || 0),
        );
        return NextResponse.json({ success: true, ...res, company: paperclipEngine.getState() });
      }

      if (json.action === "set_budget") {
        if (!json.memberId) throw new Error("Missing 'memberId' parameter");
        const budget = paperclipEngine.setBudget(json.memberId, json.updates || {});
        return NextResponse.json({ success: true, budget, company: paperclipEngine.getState() });
      }

      if (json.action === "run_standup") {
        const session = paperclipEngine.runStandup();
        return NextResponse.json({ success: true, session, company: paperclipEngine.getState() });
      }

      if (json.action === "request_approval") {
        if (!json.requesterId || !json.actionType || !json.reason) {
          throw new Error("Missing required parameters for approval request");
        }
        const item = paperclipEngine.requestApproval(
          json.requesterId,
          json.actionType,
          json.reason,
          json.payload,
          json.riskLevel,
        );
        return NextResponse.json({ success: true, approval: item, company: paperclipEngine.getState() });
      }

      if (json.action === "resolve_approval") {
        if (!json.id || !json.decision) {
          throw new Error("Missing 'id' or 'decision' parameter");
        }
        const res = paperclipEngine.resolveApproval(
          json.id,
          json.decision,
          json.resolvedBy || "Human Supervisor",
        );
        return NextResponse.json({ ...res, company: paperclipEngine.getState() });
      }

      return NextResponse.json({ error: "Unrecognized Paperclip action" }, { status: 400 });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}
