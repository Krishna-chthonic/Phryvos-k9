import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { hermesEngine } from "@/lib/hermes/hermes-engine";

export async function GET() {
  return vaultRoute(() => {
    return NextResponse.json({
      success: true,
      ...hermesEngine.getState(),
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
      if (json.action === "synthesize_tool") {
        if (!json.name || !json.code) {
          throw new Error("Missing 'name' or 'code' parameter for tool synthesis");
        }
        const res = await hermesEngine.synthesizeTool(
          {
            name: json.name,
            description: json.description || "Dynamic tool synthesized by Hermes Agent",
            parameters: json.parameters || [],
            code: json.code,
          },
          ctx,
        );
        return NextResponse.json({ ...res, ...hermesEngine.getState() });
      }

      if (json.action === "reflect") {
        const analysis = hermesEngine.runReflection(
          json.taskGoal || "Recent Task Execution",
          json.steps || [],
        );
        return NextResponse.json({ success: true, analysis, ...hermesEngine.getState() });
      }

      if (json.action === "export_trajectory") {
        const res = hermesEngine.exportTrajectory(ctx, json.sessionId);
        return NextResponse.json({ success: true, ...res });
      }

      return NextResponse.json({ error: "Unrecognized Hermes action" }, { status: 400 });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}
