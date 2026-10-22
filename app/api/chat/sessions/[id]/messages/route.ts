import { z } from "zod";
import {
  internalResponse,
  requireVault,
  vaultGuardResponse,
} from "@/server/vault-guard";
import { kvGet } from "@/lib/db/kv";
import type { VaultCtx } from "@/lib/providers-service";
import { createLlmClient, defaultProvider, getProviderMeta } from "@/lib/providers-service";
import {
  appendMessage,
  buildContext,
  getSession,
  listMessages,
  regenerate,
  updateSession,
  setMessageTelemetry,
} from "@/lib/chat-service";
import { maybeSummarize } from "@/lib/ai/summarize";
import { runAgentTurn } from "@/lib/agent/loop";
import type { UnifiedPart, TurnTelemetry } from "@/lib/ai/types";
import { createRouter } from "@/lib/ai/router";
import { searchChunks } from "@/lib/vector/rag";
import { ensureAgentTools } from "@/lib/agent/tools";
import { SendMessageBodySchema } from "@/lib/validation/chat";
import { validateAttachmentsForModel } from "@/lib/ai/capabilities";
import { formatVaultRAGPrompt } from "@/lib/ai/rag-boundary";
import { redactSensitiveCredentials } from "@/lib/ai/error-taxonomy";

import { resolveExecutionLimits, type EffortLevel, type AiMode } from "@/lib/ai/modes-and-effort";

/**
 * GET  /api/chat/sessions/:id/messages → {messages}
 * POST /api/chat/sessions/:id/messages {"content"?, "model"?, "regenerate"?, "effort"?, "mode"?}
 *   → text/event-stream:
 *       event: delta     {text}                  (repeated)
 *       event: step     {step, toolCallId, tool, args, result, approval?}
 *       event: approval {approvalId, tool, args, description}
 *       event: done     {messageId, usage?, toolSteps?, partial?, finish?}
 *       event: error    {code, message}
 * P4: the POST now runs the agent tool loop (lib/agent/loop.ts) — tools are
 * executed server-side, destructive ones pause on the approval event until
 * PUT /api/chat/approvals/:id answers (or auto-approve in Research Mode).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  try {
    const ctx = await requireVault();
    return Response.json({ messages: listMessages(ctx, id) });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof Error && /^Session not found/.test(e.message))
      return Response.json(
        { error: { code: "not_found", message: e.message } },
        { status: 404 },
      );
    return internalResponse(e);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionId = (await params).id;
  const body = SendMessageBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    const firstIssue = body.error.issues[0]?.message || "Bad message body";
    return Response.json(
      { error: { code: "invalid_body", message: firstIssue } },
      { status: 400 },
    );
  }
  const input = body.data;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      let aborted = false;
      req.signal.addEventListener("abort", () => {
        aborted = true;
      });
      let full = "";

      try {
        const vctx = await requireVault();
        const ctx: VaultCtx = { db: vctx.db, key: vctx.key };
        const session = getSession(ctx, sessionId);

        if (input.regenerate) {
          regenerate(ctx, sessionId);
        } else if (input.content) {
          appendMessage(ctx, sessionId, {
            role: "user",
            content: input.content as string | UnifiedPart[],
          });
        }

        let providerId = session.providerId ?? defaultProvider(ctx)?.id;
        if (!providerId) {
          send("error", {
            code: "no_provider",
            message: "No AI provider configured. Add one in Settings → Providers first.",
          });
          return;
        }

        let providerMeta: ReturnType<typeof getProviderMeta> | null = null;
        try {
          providerMeta = getProviderMeta(ctx, providerId);
        } catch {
          // May be ephemeral or default provider
        }

        let client: ReturnType<typeof createLlmClient>;
        try {
          client = createLlmClient(ctx, providerId);
        } catch {
          send("error", {
            code: "no_provider",
            message: "The provider for this chat was removed. Pick another model.",
          });
          return;
        }

        // Validate requested model against provider catalog
        let requestedModel = input.model ?? session.model;
        if (input.model && input.model !== "auto" && providerMeta?.models?.length) {
          if (!providerMeta.models.includes(input.model)) {
            console.warn(
              `[ModelValidation] Requested model '${input.model}' not in provider catalog. Falling back to '${providerMeta.models[0]}'`,
            );
            requestedModel = providerMeta.models[0];
          }
        }

        // CHAT-29: Pre-flight model capability check for attachments
        if (Array.isArray(input.content)) {
          const imageParts = input.content.filter((p: any) => p.type === "image");
          if (imageParts.length > 0) {
            const check = validateAttachmentsForModel(
              requestedModel,
              imageParts.map((img: any) => ({ mime: img.mediaType })),
            );
            if (!check.valid) {
              send("error", {
                code: "capability_mismatch",
                message: check.error || "Model does not support image attachments",
              });
              return;
            }
          }
        }

        const globalPrompt = kvGet("system_prompt");
        const { messages } = buildContext(ctx, sessionId, globalPrompt);

        // Enhance context with Vector RAG if user message is present and not disabled
        let augmentedMessages = messages;
        if (input.content && !input.regenerate && !input.noRag) {
          const userText = typeof input.content === "string" ? input.content :
            input.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ");
          if (userText.trim()) {
            try {
              const ragResults = await searchChunks(ctx, userText, 5);
              if (ragResults && ragResults.length > 0) {
                // CHAT-28: Emit SSE sources event for UI explainability
                send("sources", {
                  sources: ragResults.map((r, i) => ({
                    id: `${r.filePath}:${r.chunkIndex}:${i}`,
                    filePath: r.filePath,
                    chunkIndex: r.chunkIndex,
                    score: r.score,
                    snippet: r.content.slice(0, 300),
                  })),
                });

                // CHAT-28: Wrap in strict untrusted boundary tags with prompt injection defense
                const ragPrompt = formatVaultRAGPrompt(ragResults);
                augmentedMessages = [
                  ...messages,
                  {
                    role: "system" as const,
                    content: ragPrompt,
                  },
                ];
              }
            } catch (e) {
              console.warn("[RAG] Search failed:", e);
            }
          }
        }

        // Use Dynamic Semantic Router for model selection only when model is "auto" or not specified
        let routedModel = requestedModel;
        let routedProviderId = providerId;
        if (!requestedModel || requestedModel === "auto") {
          try {
            const router = createRouter(ctx);
            const lastUserMsg = [...augmentedMessages].reverse().find(m => m.role === "user");
            if (lastUserMsg && typeof lastUserMsg.content === "string") {
              const decision = await router.route(lastUserMsg.content, { providerId, model: requestedModel });
              routedModel = decision.model;
              routedProviderId = decision.providerId;
              if (routedProviderId !== providerId) {
                client = createLlmClient(ctx, routedProviderId);
              }
              console.log(`[Router] ${decision.reasoning}`);
            }
          } catch (e) {
            console.warn("[Router] Routing failed, using original:", e);
          }
        }

        // Synchronize active session with routed model & provider to avoid state drift
        // Only persist if the user explicitly picked a specific model, preserving "auto" mode for subsequent turns
        if (
          session.model !== "auto" &&
          routedModel &&
          (routedModel !== session.model || routedProviderId !== session.providerId)
        ) {
          try {
            updateSession(ctx, sessionId, { model: routedModel, providerId: routedProviderId });
          } catch (e) {
            console.warn("[SessionSync] Failed to update session:", e);
          }
        }

        // Resolve execution limits & system prompt for Mode and Effort level
        const { minSteps, maxSteps, providerTimeoutMs, autoApproveTools, systemPrompt, turnOptions } =
          resolveExecutionLimits(input.mode, input.effort);

        augmentedMessages = [
          ...augmentedMessages,
          {
            role: "system" as const,
            content: systemPrompt,
          },
        ];

        const holder: { m: ReturnType<typeof appendMessage> | null } = { m: null };
        let toolSteps = 0;
        let agentFinish = "stop";
        const turnStartTime = Date.now();
        try {
          // Ensure all agent tools are registered (includes physics, ToT, etc.)
          ensureAgentTools();

          const result = await runAgentTurn({
            db: ctx.db,
            key: ctx.key,
            client,
            model: routedModel,
            initialMessages: augmentedMessages,
            signal: req.signal,
            mode: input.mode,
            effort: input.effort,
            minSteps,
            maxSteps,
            providerTimeoutMs,
            autoApproveTools,
            turnOptions,
            onDelta: (d) => {
              if (aborted) throw new Error("__aborted__");
              full += d;
              send("delta", { text: d });
            },
            onStep: (s) => {
              toolSteps = Math.max(toolSteps, s.step);
              send("step", s);
            },
            onApprovalRequest: (a) => send("approval", a),
            appendAssistant: (t, tcs) => {
              holder.m = appendMessage(ctx, sessionId, {
                role: "assistant",
                content: t,
                toolCalls: tcs.length ? tcs : null,
              });
            },
            appendTool: (toolCallId, name, content) => {
              appendMessage(ctx, sessionId, {
                role: "tool",
                content,
                toolCallId,
              });
              void name;
            },
          });
          toolSteps = result.toolSteps;
          agentFinish = result.finish;
          const latencyMs = Date.now() - turnStartTime;
          const turnTelemetry: TurnTelemetry = {
            latencyMs,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            totalTokens:
              (result.promptTokens ?? 0) + (result.completionTokens ?? 0) ||
              result.tokensUsed,
            model: routedModel,
            provider:
              providerMeta?.name ?? (routedProviderId ? String(routedProviderId) : "unknown"),
            finishReason: agentFinish,
          };

          if (!aborted && holder.m) {
            try {
              setMessageTelemetry(ctx, sessionId, holder.m.id, turnTelemetry);
            } catch (err) {
              console.warn("[Telemetry] Failed to persist telemetry:", err);
            }
            await maybeSummarize(ctx, client, routedModel, sessionId, messages, holder.m.seq);
          }
          if (!aborted) {
            send("done", {
              messageId: holder.m?.id ?? null,
              toolSteps,
              finish: agentFinish,
              telemetry: turnTelemetry,
            });
          }
        } catch (e) {
          if (aborted || (e instanceof Error && e.message === "__aborted__")) {
            if (full) {
              appendMessage(ctx, sessionId, {
                role: "assistant",
                content: full,
                toolCalls: null,
              });
            }
            send("done", { messageId: null, partial: true });
            return;
          }
          throw e;
        }

        if (aborted) {
          send("done", { messageId: null, partial: true });
          return;
        }
      } catch (e) {
        if (aborted || (e instanceof Error && e.message === "__aborted__")) {
          // already handled inside the agent block
        } else {
          const rawMsg = e instanceof Error ? e.message : "Provider error";
          send("error", {
            code: "provider_error",
            message: redactSensitiveCredentials(rawMsg),
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
