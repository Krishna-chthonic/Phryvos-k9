import { NextRequest, NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { createFreeFrontierClient } from "@/lib/ai/free-frontier-service";

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  const model = json.model || "deepseek-chat";
  const prompt = json.prompt || "Say hello and give a 1-sentence tip on writing clean code.";

  const start = Date.now();
  const client = createFreeFrontierClient();

  try {
    const turn = await client.createTurn(
      [{ role: "user", content: prompt }],
      undefined,
      model,
      undefined,
      { timeoutMs: 35_000 },
    );

    const latencyMs = Date.now() - start;

    return NextResponse.json({
      success: true,
      model,
      reply: turn.text,
      latencyMs,
      finish: turn.finish,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      },
      { status: 500 },
    );
  }
}
