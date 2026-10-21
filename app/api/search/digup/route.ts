import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { hybridDigUpSearch, indexVaultForDigUp, getDigUpStats } from "@/lib/search/digup-engine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const statsOnly = searchParams.get("stats") === "true";
  const limit = Math.min(Number(searchParams.get("limit") || 15), 50);
  const fileTypes = searchParams.get("fileTypes")?.split(",").map((s) => s.trim()).filter(Boolean);

  return vaultRoute(async (ctx) => {
    try {
      if (statsOnly || !q) {
        const stats = await getDigUpStats(ctx);
        return NextResponse.json({ success: true, stats });
      }

      const results = await hybridDigUpSearch(ctx, q, { limit, fileTypes });
      return NextResponse.json({ success: true, query: q, count: results.length, results });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  return vaultRoute(async (ctx) => {
    try {
      if (json.action === "index") {
        const dirPath = json.dirPath || "/";
        const result = await indexVaultForDigUp(ctx, dirPath);
        const stats = await getDigUpStats(ctx);
        return NextResponse.json({ success: true, result, stats });
      }

      if (json.action === "search") {
        if (!json.query) throw new Error("Missing 'query' parameter");
        const results = await hybridDigUpSearch(ctx, json.query, {
          limit: json.limit,
          fileTypes: json.fileTypes,
        });
        return NextResponse.json({ success: true, query: json.query, count: results.length, results });
      }

      if (json.action === "stats") {
        const stats = await getDigUpStats(ctx);
        return NextResponse.json({ success: true, stats });
      }

      return NextResponse.json({ error: "Unrecognized action. Use 'search', 'index', or 'stats'." }, { status: 400 });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}
