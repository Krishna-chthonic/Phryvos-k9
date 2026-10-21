import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import {
  getOrcaFleet,
  createOrcaWorktree,
  getOrcaWorktreeDiff,
  dryRunOrcaMerge,
  mergeAndPruneOrcaWorktree,
} from "@/lib/orca/orca-engine";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const baseBranch = searchParams.get("base") || "main";

  return vaultRoute(async () => {
    try {
      const fleet = await getOrcaFleet(baseBranch);
      return NextResponse.json({ success: true, count: fleet.length, fleet });
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

  const baseBranch = json.baseBranch || "main";

  return vaultRoute(async () => {
    try {
      if (json.action === "create") {
        if (!json.name) throw new Error("Missing 'name' parameter");
        const res = await createOrcaWorktree(json.name, baseBranch);
        return NextResponse.json(res);
      }

      if (json.action === "diff") {
        if (!json.name) throw new Error("Missing 'name' parameter");
        const diff = await getOrcaWorktreeDiff(json.name, baseBranch);
        return NextResponse.json({ success: true, ...diff });
      }

      if (json.action === "dry_run") {
        if (!json.name) throw new Error("Missing 'name' parameter");
        const dryRun = await dryRunOrcaMerge(json.name, baseBranch);
        return NextResponse.json({ success: true, dryRun });
      }

      if (json.action === "merge") {
        if (!json.name) throw new Error("Missing 'name' parameter");
        const res = await mergeAndPruneOrcaWorktree(json.name, baseBranch, {
          squash: json.squash,
          prune: json.prune,
          customCommitMsg: json.commitMsg,
        });
        return NextResponse.json(res);
      }

      return NextResponse.json({ error: "Unrecognized Orca action" }, { status: 400 });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}
