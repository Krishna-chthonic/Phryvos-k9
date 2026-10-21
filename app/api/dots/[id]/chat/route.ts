import { z } from "zod";
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { getDot, updateDot, listDotMessages, appendDotMessage } from "@/lib/dots-service";
import { createLlmClient, defaultProvider, listProviders } from "@/lib/providers-service";
import { runAgentTurn } from "@/lib/agent/loop";
import { ensureAgentTools } from "@/lib/agent/tools";
import { enhancePromptWithEcc } from "@/lib/ai/prompts/ecc-instincts";
import type { UnifiedMessage } from "@/lib/ai/types";

const ChatBodySchema = z.object({
  content: z.string().min(1),
  model: z.string().optional(),
  providerId: z.number().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    const ctx = await requireVault();
    const dot = getDot(ctx, id);
    if (!dot) {
      return Response.json({ error: { code: "not_found", message: "Dot not found" } }, { status: 404 });
    }

    const body = await req.json();
    const parsed = ChatBodySchema.parse(body);

    // Save user message to dot's history
    appendDotMessage(ctx, id, {
      role: "user",
      content: parsed.content,
    });

    // Mark Dot as working
    updateDot(ctx, id, { status: "working" });

    // Prepare previous messages for context
    const history = listDotMessages(ctx, id);
    const messages: UnifiedMessage[] = [
      {
        role: "system",
        content: `${enhancePromptWithEcc(dot.systemPrompt, dot.role)}\n\nYou are operating as the specialist AI coworker "${dot.name}" (${dot.role}).\nYour working environment is "${dot.workingDirectory}".\nEnabled tools: ${dot.tools.join(", ")}. Provide clear, thoughtful, high-quality responses and use tools actively to execute work.`,
      },
      ...history.slice(-15).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    // Determine LLM provider & client
    const allProviders = listProviders(ctx);
    const provider = (parsed.providerId ? allProviders.find((p) => p.id === parsed.providerId) : null)
      ?? defaultProvider(ctx)
      ?? allProviders[0];

    if (!provider) {
      updateDot(ctx, id, { status: "idle" });
      return Response.json(
        { error: { code: "no_provider", message: "No AI provider configured in Settings" } },
        { status: 400 }
      );
    }

    const client = createLlmClient(ctx, provider.id);
    const selectedModel = (parsed.model && parsed.model !== "auto")
      ? parsed.model
      : (dot.model && dot.model !== "auto" ? dot.model : (provider.models[0] || "default"));

    // Stream SSE response
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const enc = new TextEncoder();

    const send = (ev: string, data: unknown) => {
      writer.write(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`));
    };

    (async () => {
      let full = "";
      try {
        ensureAgentTools();

        const result = await runAgentTurn({
          db: ctx.db,
          key: ctx.key,
          client,
          model: selectedModel,
          allowedTools: dot.tools,
          initialMessages: messages,
          signal: req.signal,
          maxSteps: 8,
          providerTimeoutMs: 120_000,
          onDelta: (delta) => {
            full += delta;
            send("delta", { text: delta });
          },
          onStep: (step) => {
            send("step", step);
          },
          onApprovalRequest: (approval) => {
            send("approval", approval);
          },
          appendAssistant: (text) => {
            appendDotMessage(ctx, id, {
              role: "assistant",
              content: text,
            });
          },
          appendTool: (_id, name, content) => {
            appendDotMessage(ctx, id, {
              role: "tool",
              content,
              toolName: name,
            });
          },
        });

        // Set Dot back to idle / complete
        updateDot(ctx, id, { status: "complete" });
        send("done", { finish: result.finish, toolSteps: result.toolSteps });
      } catch (err) {
        updateDot(ctx, id, { status: "idle" });
        if (full) {
          appendDotMessage(ctx, id, {
            role: "assistant",
            content: full,
          });
        }
        send("error", {
          message: err instanceof Error ? err.message : "Failed to execute dot turn",
        });
      } finally {
        writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof z.ZodError) {
      return Response.json({ error: { code: "invalid_input", issues: e.issues } }, { status: 400 });
    }
    return internalResponse(e);
  }
}
