/**
 * Auto-summarization and session compaction for context management.
 *
 * Importers/callers: app/api/chat/sessions/[id]/messages/route.ts, app/api/chat/sessions/[id]/compact/route.ts
 * Affected API: Chat message streaming and compaction endpoints
 * Data schemas if any: chat_sessions (summary_enc, summary_nonce, summary_tag, summary_until)
 * User instruction verbatim: "2. agar isme compaction ka system hota toh thik rahta like koi session jyada lamba ho gaya toh dikkat ho sakti hai"
 */
import type { LlmClient, UnifiedMessage } from "./types";
import type { VaultCtx } from "@/lib/providers-service";
import { storeSummary, listMessages, getSession } from "@/lib/chat-service";

/**
 * Auto-summarization for context overflow: when the visible context (prompt +
 * stored summary + recent messages) grows past the budget, keep the newest 4
 * messages and summarize the older tail with the same provider (no tools).
 * Failure is non-fatal — chat must never die on summarization.
 */

const TOKEN_BUDGET = 12_000;

export function estTokens(msgs: UnifiedMessage[]): number {
  let chars = 0;
  for (const m of msgs) {
    chars +=
      typeof m.content === "string"
        ? m.content.length
        : m.content.reduce((n, p) => n + (p.text?.length ?? 0), 0);
  }
  return Math.ceil(chars / 4);
}

export async function maybeSummarize(
  ctx: VaultCtx,
  client: LlmClient,
  model: string,
  sessionId: string,
  messages: UnifiedMessage[],
  lastSeq: number,
): Promise<void> {
  if (estTokens(messages) <= TOKEN_BUDGET) return;
  const keep = 4;
  const older = messages.slice(0, messages.length - keep);
  if (older.length < 2) return;
  try {
    const res = await client.createTurn(
      [
        {
          role: "system",
          content:
            "Summarize the older part of this conversation. Preserve facts, decisions, file paths, IDs, math problem states, and open questions. Be terse. ≤400 words.",
        },
        ...older,
      ],
      undefined,
      model,
    );
    // keep the newest messages, so the summary covers everything before them
    storeSummary(ctx, sessionId, res.text.trim(), Math.max(0, lastSeq - keep));
  } catch {
    /* non-fatal */
  }
}

export async function compactSession(
  ctx: VaultCtx,
  client: LlmClient,
  model: string,
  sessionId: string,
): Promise<{ summary: string; compactedCount: number }> {
  const session = getSession(ctx, sessionId);
  const allMsgs = listMessages(ctx, sessionId);
  if (allMsgs.length < 2) {
    throw new Error("Conversation is too short to compact (needs at least 2 messages).");
  }

  // Keep the last 2-3 messages for ongoing conversational context
  const keep = Math.min(3, Math.floor(allMsgs.length / 2));
  const msgsToCompact = allMsgs.slice(0, allMsgs.length - keep);
  const cutoffSeq = msgsToCompact[msgsToCompact.length - 1].seq;

  const unified: UnifiedMessage[] = msgsToCompact.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

  const res = await client.createTurn(
    [
      {
        role: "system",
        content: `You are compacting an ongoing conversation history to save tokens.
Condense the conversation into a clear, structured, factual summary.
Make sure to preserve:
- User requirements, preferences, and personal facts
- Core discussion topics, questions asked, and answers provided
- Mathematical problem formulations, numerical results, and equations
- Code architecture decisions, files touched, or configurations
- Current pending tasks or next steps
Keep it concise, well-structured, and factual.`,
      },
      ...unified,
    ],
    undefined,
    model,
  );

  const summaryText = res.text.trim();
  storeSummary(ctx, sessionId, summaryText, cutoffSeq);

  return {
    summary: summaryText,
    compactedCount: msgsToCompact.length,
  };
}
