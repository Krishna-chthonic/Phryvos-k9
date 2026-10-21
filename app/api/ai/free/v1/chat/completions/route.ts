import { NextRequest, NextResponse } from "next/server";
import { requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { createFreeFrontierClient, FREE_FRONTIER_MODELS } from "@/lib/ai/free-frontier-service";
import type { UnifiedMessage } from "@/lib/ai/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await requireVault();
  } catch (authErr) {
    const auth = vaultGuardResponse(authErr);
    if (auth) return auth;
    return NextResponse.json({ error: { message: "Vault session required", type: "auth_required" } }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { model = "deepseek-chat", messages = [], stream = false, temperature, max_tokens } = body;

    if (!Array.isArray(messages) || messages.length > 100) {
      return NextResponse.json({ error: { message: "Messages array must contain between 1 and 100 items", type: "invalid_request_error" } }, { status: 400 });
    }

    // Convert OpenAI messages to UnifiedMessage[]
    const unifiedMessages: UnifiedMessage[] = messages.map((m: any) => ({
      role: m.role || "user",
      content: m.content || "",
    }));

    const client = createFreeFrontierClient();
    const completionId = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            await client.createTurn(
              unifiedMessages,
              undefined,
              model,
              (delta) => {
                const chunk = {
                  id: completionId,
                  object: "chat.completion.chunk",
                  created,
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { content: delta },
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              },
              {
                temperature,
                maxTokens: max_tokens,
              },
            );

            // Final chunk
            const finalChunk = {
              id: completionId,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: "stop",
                },
              ],
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (streamErr) {
            controller.error(streamErr);
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming response
    const turn = await client.createTurn(
      unifiedMessages,
      undefined,
      model,
      undefined,
      { temperature, maxTokens: max_tokens },
    );

    return NextResponse.json({
      id: completionId,
      object: "chat.completion",
      created,
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: turn.text,
          },
          finish_reason: turn.finish || "stop",
        },
      ],
      usage: turn.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    });
  } catch (err) {
    console.error("[FreeProxy API] Error:", err);
    return NextResponse.json(
      {
        error: {
          message: err instanceof Error ? err.message : String(err),
          type: "free_gateway_error",
        },
      },
      { status: 500 },
    );
  }
}
