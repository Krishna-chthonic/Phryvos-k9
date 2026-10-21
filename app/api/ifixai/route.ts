import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { ifixaiEngine } from "@/lib/audit/ifixai-engine";

export async function GET() {
  return vaultRoute(() => {
    return NextResponse.json({
      success: true,
      scorecard: ifixaiEngine.getScorecard(),
    });
  });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  return vaultRoute(async (ctx) => {
    try {
      if (json.action === "audit_target") {
        if (!json.targetName || !json.promptContent) {
          throw new Error("Missing 'targetName' or 'promptContent'");
        }
        const res = ifixaiEngine.auditPromptOrDot(json.targetName, json.promptContent);
        return NextResponse.json({ success: true, ...res });
      }

      if (json.action === "scan_vault") {
        const res = await ifixaiEngine.scanVault(ctx, json.targetDir || "/");
        return NextResponse.json({ success: true, ...res });
      }

      if (json.action === "get_scorecard") {
        return NextResponse.json({ success: true, scorecard: ifixaiEngine.getScorecard() });
      }

      return NextResponse.json({ error: "Unrecognized action for iFixAi" }, { status: 400 });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}
