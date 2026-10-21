import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { browserSkill } from "@/lib/browser/browserskill-engine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 25), 100);

  return vaultRoute(() => {
    return NextResponse.json({
      consoleLogs: browserSkill.getConsoleLogs(limit),
      networkLogs: browserSkill.getNetworkLogs(limit),
    });
  });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const sessionId = json.sessionId || "default";

  return vaultRoute(async ({ db, key }) => {
    try {
      if (json.command) {
        const args = json.command.trim().split(/\s+/);
        if (args[0] === "bsk") args.shift();
        const output = await browserSkill.executeCli({ db, key }, args, sessionId);
        return NextResponse.json({ success: true, output });
      }

      if (json.action === "open") {
        if (!json.url) throw new Error("Missing 'url' parameter");
        const res = await browserSkill.bskOpen(sessionId, json.url);
        return NextResponse.json({ success: true, result: res });
      }

      if (json.action === "screenshot") {
        const res = await browserSkill.bskScreenshot({ db, key }, sessionId, json.targetPath);
        return NextResponse.json({ success: true, result: res });
      }

      if (json.action === "clear") {
        browserSkill.clearLogs();
        return NextResponse.json({ success: true, message: "Logs cleared." });
      }

      return NextResponse.json({ error: "Unrecognized browser skill action" }, { status: 400 });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}
