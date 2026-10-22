import type { ChatSessionMeta, ChatMessageDto } from "@/lib/chat-client";
import { textOf } from "@/components/chat/MessageRow";

export interface DateGroupedSessions {
  today: ChatSessionMeta[];
  yesterday: ChatSessionMeta[];
  last7Days: ChatSessionMeta[];
  older: ChatSessionMeta[];
}

/**
 * Groups chat sessions into human-friendly time periods (CHAT-40).
 */
export function groupSessionsByDate(
  sessions: ChatSessionMeta[],
  nowMs: number = Date.now(),
): DateGroupedSessions {
  const nowDate = new Date(nowMs);
  const startOfToday = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOf7Days = startOfToday - 6 * 86_400_000;

  const grouped: DateGroupedSessions = {
    today: [],
    yesterday: [],
    last7Days: [],
    older: [],
  };

  for (const s of sessions) {
    const t = s.updatedAt || s.createdAt;
    if (t >= startOfToday) {
      grouped.today.push(s);
    } else if (t >= startOfYesterday) {
      grouped.yesterday.push(s);
    } else if (t >= startOf7Days) {
      grouped.last7Days.push(s);
    } else {
      grouped.older.push(s);
    }
  }

  return grouped;
}

/**
 * Formats a conversation session and its messages into portable Markdown (CHAT-44).
 */
export function exportConversationAsMarkdown(
  session: { title: string | null; model: string; createdAt: number },
  messages: ChatMessageDto[],
): string {
  const title = session.title?.trim() || "Untitled Conversation";
  const dateStr = new Date(session.createdAt).toLocaleString();
  const lines: string[] = [
    `# ${title}`,
    "",
    `> **Model:** \`${session.model}\`  `,
    `> **Exported:** ${dateStr}  `,
    `> **System:** Phryvos Personal AI Workspace`,
    "",
    "---",
    "",
  ];

  for (const m of messages) {
    if (m.role === "tool") continue;
    const speaker = m.role === "user" ? "### 👤 User" : "### 🤖 Phryvos AI";
    const body = textOf(m.content);
    lines.push(speaker);
    lines.push("");
    lines.push(body);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Formats a conversation session and its messages into clean JSON (CHAT-44).
 */
export function exportConversationAsJson(
  session: ChatSessionMeta,
  messages: ChatMessageDto[],
): string {
  const exportPayload = {
    version: "1.0",
    schema: "phryvos-chat-export",
    exportedAt: Date.now(),
    session: {
      id: session.id,
      title: session.title,
      model: session.model,
      providerId: session.providerId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      summary: session.summary ?? null,
    },
    messages: messages.map((m) => ({
      id: m.id,
      seq: m.seq,
      role: m.role,
      content: textOf(m.content),
      toolCalls: m.toolCalls,
      createdAt: m.createdAt,
    })),
  };

  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Triggers browser file download for text/json blobs (CHAT-44).
 */
export function triggerFileDownload(content: string, filename: string, mime: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface ConversationMatch {
  messageId: string;
  startIndex: number;
  endIndex: number;
  globalIndex: number;
}

/**
 * In-conversation search matcher (Feature B).
 * Case-insensitive search across visible messages, returning exact character offsets and global index.
 */
export function findConversationMatches(
  messages: ChatMessageDto[],
  query: string,
): ConversationMatch[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const matches: ConversationMatch[] = [];
  let globalIndex = 0;

  for (const m of messages) {
    if (m.role === "tool") continue;
    const body = textOf(m.content);
    const lowerBody = body.toLowerCase();
    let searchStart = 0;

    while (searchStart < lowerBody.length) {
      const idx = lowerBody.indexOf(trimmed, searchStart);
      if (idx === -1) break;
      matches.push({
        messageId: m.id,
        startIndex: idx,
        endIndex: idx + trimmed.length,
        globalIndex: globalIndex++,
      });
      searchStart = idx + trimmed.length;
    }
  }

  return matches;
}

/**
 * Generates session-isolated storage key for composer draft recovery (Feature C).
 */
export function getDraftStorageKey(sessionId: string): string {
  return `phryvos_draft_${sessionId}`;
}

