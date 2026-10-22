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
import type { ChatMessageDto } from "@/lib/chat-client";

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

/**
 * Walks backwards from the candidate slice point to ensure tool-caller turns and
 * their corresponding tool result messages are NEVER severed into separate partitions.
 * Returns the safe cutoff index (messages before cutoff are compacted, messages at/after are kept).
 */
export function findSafeCompactionCutoff(
  messages: ChatMessageDto[],
  keepCount: number,
): number {
  if (messages.length <= keepCount) return 0;
  let cutoff = messages.length - keepCount;

  // If candidate cutoff lands on a tool response turn, walk backwards past all tool turns
  // and the assistant turn that issued the tool calls.
  while (cutoff > 0 && messages[cutoff]?.role === "tool") {
    cutoff--;
  }

  // If candidate cutoff lands on an assistant turn with tool calls whose results are in the kept region,
  // walk backwards before that assistant turn.
  if (
    cutoff > 0 &&
    messages[cutoff]?.role === "assistant" &&
    messages[cutoff]?.toolCalls &&
    messages[cutoff].toolCalls!.length > 0
  ) {
    cutoff--;
  }

  // Ensure cutoff does not land on an orphaned tool message
  while (cutoff > 0 && messages[cutoff]?.role === "tool") {
    cutoff--;
  }

  return Math.max(0, cutoff);
}

/**
 * Builds a structured compaction prompt preserving critical user decisions, formulas, and architecture.
 */
export function buildStructuredCompactionPrompt(
  previousSummary: string | null | undefined,
  messagesToCompact: (ChatMessageDto | UnifiedMessage)[],
): string {
  const prevSection = previousSummary?.trim()
    ? `\nPrior context summary to integrate:\n"""\n${previousSummary.trim()}\n"""\n`
    : "";

  return `You are compacting an ongoing conversation history to save tokens while preserving critical facts.
${prevSection}
Synthesize the conversation into a clear, structured summary containing the following sections:
### 1. Decisions & User Preferences
- Key user instructions, constraints, and confirmed preferences
### 2. Math, Equations & Technical Context
- Precise formulas, numerical values, equations, theorems, and physics constants
### 3. Files Touched & Code Architecture
- File paths, API schemas, database schemas, and architectural designs
### 4. Active Goals & Unresolved Questions
- Current active tasks, unresolved bugs, pending derivations, or next steps

Be concise, dense, factual, and strictly objective. Do not omit crucial formulas or user constraints.`;
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
    const prompt = buildStructuredCompactionPrompt(null, older);
    const res = await client.createTurn(
      [
        {
          role: "system",
          content: prompt,
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

  // Keep the last 2-3 messages for ongoing conversational context safely
  const keep = Math.min(3, Math.floor(allMsgs.length / 2));
  const cutoffIndex = findSafeCompactionCutoff(allMsgs, keep);
  const msgsToCompact = cutoffIndex > 0 ? allMsgs.slice(0, cutoffIndex) : allMsgs.slice(0, allMsgs.length - keep);
  const cutoffSeq = msgsToCompact[msgsToCompact.length - 1].seq;

  const unified: UnifiedMessage[] = msgsToCompact.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

  const prompt = buildStructuredCompactionPrompt(session.summary, msgsToCompact);

  const res = await client.createTurn(
    [
      {
        role: "system",
        content: prompt,
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
