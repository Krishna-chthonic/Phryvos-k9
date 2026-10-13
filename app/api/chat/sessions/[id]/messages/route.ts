import { z } from "zod";
import {
  internalResponse,
  requireVault,
  vaultGuardResponse,
} from "@/server/vault-guard";
import { kvGet } from "@/lib/db/kv";
import type { VaultCtx } from "@/lib/providers-service";
import { createLlmClient, defaultProvider } from "@/lib/providers-service";
import {
  appendMessage,
  buildContext,
  getSession,
  listMessages,
  regenerate,
} from "@/lib/chat-service";
import { maybeSummarize } from "@/lib/ai/summarize";
import { runAgentTurn } from "@/lib/agent/loop";
import type { UnifiedPart } from "@/lib/ai/types";

/**
 * GET  /api/chat/sessions/:id/messages → {messages}
 * POST /api/chat/sessions/:id/messages {"content"?, "model"?, "regenerate"?}
 *   → text/event-stream:
 *       event: delta     {text}                  (repeated)
 *       event: step     {step, toolCallId, tool, args, result, approval?}
 *       event: approval {approvalId, tool, args, description}
 *       event: done     {messageId, usage?, toolSteps?, partial?, finish?}
 *       event: error    {code, message}
 * P4: the POST now runs the agent tool loop (lib/agent/loop.ts) — tools are
 * executed server-side, destructive ones pause on the approval event until
 * PUT /api/chat/approvals/:id answers.
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

const Body = z.object({
  content: z.union([z.string().min(1), z.array(z.any()).min(1)]).optional(),
  model: z.string().min(1).optional(),
  regenerate: z.boolean().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionId = (await params).id;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: { code: "invalid_body", message: "Bad message body" } },
      { status: 400 },
    );
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
        const model = input.model ?? session.model;

        const globalPrompt = kvGet("system_prompt");
        const { messages } = buildContext(ctx, sessionId, globalPrompt);

        const holder: { m: ReturnType<typeof appendMessage> | null } = { m: null };
        let toolSteps = 0;
        let agentFinish = "stop";
        try {
          const result = await runAgentTurn({
            db: ctx.db,
            key: ctx.key,
            client,
            model,
            initialMessages: messages,
            signal: req.signal,
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
          if (!aborted && holder.m) {
            await maybeSummarize(ctx, client, model, sessionId, messages, holder.m.seq);
          }
          if (!aborted) {
            send("done", {
              messageId: holder.m?.id ?? null,
              toolSteps,
              finish: agentFinish,
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
          send("error", {
            code: "provider_error",
            message: e instanceof Error ? e.message : "Provider error",
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
