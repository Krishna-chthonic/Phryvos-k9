import { z } from "zod";
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import {
  getDot,
  updateDot,
  listDotMessages,
  appendDotMessage,
  listDotSpaces,
  formatSpacesContext,
} from "@/lib/dots-service";
import { createLlmClient, defaultProvider, listProviders } from "@/lib/providers-service";
import { runAgentTurn } from "@/lib/agent/loop";
import { ensureAgentTools } from "@/lib/agent/tools";
import { resolveAllowedTools } from "@/lib/dots-runner";
import { scrubSecrets } from "@/lib/dots/secret-scrubber";
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

    // Prepare spaces context (D-17)
    const spaces = listDotSpaces(ctx, id);
    const spacesContext = formatSpacesContext(spaces);

    // Prepare previous messages for context with canonical tool calls (D-14)
    const history = listDotMessages(ctx, id);
    const messages: UnifiedMessage[] = [
      {
        role: "system",
        content: `${enhancePromptWithEcc(dot.systemPrompt, dot.role)}\n\nYou are operating as the specialist AI coworker "${dot.name}" (${dot.role}).\nYour working environment is "${dot.workingDirectory}".\nEnabled tools: ${dot.tools.join(", ")}. Provide clear, thoughtful, high-quality responses and use tools actively to execute work.${spacesContext}`,
      },
      ...history.slice(-20).map((m): UnifiedMessage => {
        if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: "assistant",
            content: m.content,
            toolCalls: m.toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.function?.name || tc.name || "unknown",
              args: tc.function?.arguments
                ? (() => {
                    try {
                      return JSON.parse(tc.function.arguments);
                    } catch {
                      return {};
                    }
                  })()
                : tc.args || {},
            })),
          };
        }
        if (m.role === "tool" && m.toolCallId) {
          return {
            role: "tool",
            content: m.content,
            toolCallId: m.toolCallId,
            name: m.toolName || undefined,
          };
        }
        return {
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        };
      }),
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

    // Periodic keepalive ping every 15s to prevent gateway timeouts (D-15)
    const pingTimer = setInterval(() => {
      try {
        writer.write(enc.encode(`: ping\n\n`));
      } catch {
        clearInterval(pingTimer);
      }
    }, 15000);

    (async () => {
      let full = "";
      try {
        ensureAgentTools();

        const allowedTools = resolveAllowedTools(dot.tools);

        const result = await runAgentTurn({
          db: ctx.db,
          key: ctx.key,
          client,
          model: selectedModel,
          allowedTools,
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
          appendAssistant: (text, toolCalls) => {
            appendDotMessage(ctx, id, {
              role: "assistant",
              content: text,
              toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.args || {}),
                },
              })) : null,
            });
          },
          appendTool: (toolCallId, name, content) => {
            appendDotMessage(ctx, id, {
              role: "tool",
              content,
              toolCallId,
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
        const rawMsg = err instanceof Error ? err.message : "Failed to execute dot turn";
        send("error", {
          message: scrubSecrets(rawMsg),
        });
      } finally {
        clearInterval(pingTimer);
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
