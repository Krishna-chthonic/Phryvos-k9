import type Database from "better-sqlite3";
import type { ChatMessage, UnifiedPart } from "../domain/chat";

export interface MessageRepository {
  listBySession(db: Database.Database, sessionId: string): ChatMessage[];
  add(db: Database.Database, msg: ChatMessage): void;
  delete(db: Database.Database, id: string): void;
}

export class SqliteMessageRepository implements MessageRepository {
  public listBySession(db: Database.Database, sessionId: string): ChatMessage[] {
    const rows = db.prepare(`
      SELECT id, session_id AS sessionId, role, content, tool_calls AS toolCalls, created_at AS createdAt
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
    `).all(sessionId) as Record<string, unknown>[];

    return rows.map((r) => {
      let content: string | UnifiedPart[] = r.content as string;
      try {
        const parsed = JSON.parse(r.content as string);
        if (Array.isArray(parsed)) content = parsed;
      } catch {}

      let toolCalls: Record<string, unknown>[] | null = null;
      try {
        if (typeof r.toolCalls === "string") toolCalls = JSON.parse(r.toolCalls);
      } catch {}

      return {
        id: r.id as string,
        sessionId: r.sessionId as string,
        role: r.role as ChatMessage["role"],
        content,
        toolCalls,
        createdAt: Number(r.createdAt),
      };
    });
  }

  public add(db: Database.Database, msg: ChatMessage): void {
    const contentStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    const toolCallsStr = msg.toolCalls ? JSON.stringify(msg.toolCalls) : null;

    db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, content, tool_calls, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(msg.id, msg.sessionId, msg.role, contentStr, toolCallsStr, msg.createdAt);

    // Update parent session's updated_at timestamp
    db.prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?").run(msg.createdAt, msg.sessionId);
  }

  public delete(db: Database.Database, id: string): void {
    db.prepare("DELETE FROM chat_messages WHERE id = ?").run(id);
  }
}

export const messageRepo = new SqliteMessageRepository();
