import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { swarmEngine, SwarmTopology } from "@/lib/swarm/swarm-engine";

export async function GET() {
  return vaultRoute(() => {
    return NextResponse.json({
      success: true,
      session: swarmEngine.getState(),
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
      if (json.action === "spawn") {
        if (!json.goal) throw new Error("Missing 'goal' parameter");
        const topology: SwarmTopology = json.topology || "hierarchical";
        const session = swarmEngine.spawn(json.goal, topology);
        return NextResponse.json({ success: true, session });
      }

      if (json.action === "step") {
        const result = await swarmEngine.step(ctx);
        return NextResponse.json({ success: true, ...result });
      }

      if (json.action === "vote") {
        if (!json.proposal) throw new Error("Missing 'proposal' parameter");
        const ballot = swarmEngine.conductConsensusVote(
          json.taskId || "ad-hoc",
          json.proposal,
          json.threshold,
        );
        return NextResponse.json({ success: true, ballot, session: swarmEngine.getState() });
      }

      if (json.action === "post_blackboard") {
        if (!json.content) throw new Error("Missing 'content' parameter");
        const entry = swarmEngine.postBlackboard(
          json.authorId || "agent-coord",
          json.topic || "general",
          json.content,
          json.tags || [],
        );
        return NextResponse.json({ success: true, entry, session: swarmEngine.getState() });
      }

      if (json.action === "reset") {
        swarmEngine.reset();
        return NextResponse.json({ success: true, session: swarmEngine.getState() });
      }

      return NextResponse.json({ error: "Unrecognized swarm action" }, { status: 400 });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}
