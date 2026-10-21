import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { eccEngine, RuleCategory } from "@/lib/ecc/ecc-engine";

export async function GET() {
  return vaultRoute(() => {
    return NextResponse.json({
      success: true,
      ...eccEngine.getState(),
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
      if (json.action === "learn_rule") {
        if (!json.title || !json.ruleText) {
          throw new Error("Missing 'title' or 'ruleText'");
        }
        const rule = eccEngine.learnRule(
          json.title,
          json.ruleText,
          json.category || "coding",
          json.source || "user_correction",
          ctx,
        );
        return NextResponse.json({ success: true, rule, ...eccEngine.getState() });
      }

      if (json.action === "delete_rule") {
        if (!json.id) throw new Error("Missing 'id' parameter");
        const deleted = eccEngine.deleteRule(json.id);
        return NextResponse.json({ success: deleted, ...eccEngine.getState() });
      }

      if (json.action === "verify_gate") {
        const checklist = eccEngine.runVerificationGate({
          taskId: json.taskId,
          hasTypeScriptPassed: json.hasTypeScriptPassed ?? true,
          hasBuildPassed: json.hasBuildPassed ?? true,
          commentsPreserved: json.commentsPreserved ?? true,
          unrelatedDiffsAvoided: json.unrelatedDiffsAvoided ?? true,
        });
        return NextResponse.json({ success: true, checklist, ...eccEngine.getState() });
      }

      return NextResponse.json({ error: "Unrecognized action for ECC" }, { status: 400 });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}
