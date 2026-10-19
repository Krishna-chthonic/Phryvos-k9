import type Database from "better-sqlite3";
import type { ChatSessionMeta } from "../domain/chat";

export interface ConversationRepository {
  list(db: Database.Database): ChatSessionMeta[];
  getById(db: Database.Database, id: string): ChatSessionMeta | null;
  create(db: Database.Database, session: ChatSessionMeta): void;
  update(db: Database.Database, id: string, patch: Partial<ChatSessionMeta>): void;
  delete(db: Database.Database, id: string): void;
}

export class SqliteConversationRepository implements ConversationRepository {
  public list(db: Database.Database): ChatSessionMeta[] {
    const rows = db.prepare(`
      SELECT s.id, s.title, s.provider_id AS providerId, s.model, s.mode, s.effort,
             s.summary, s.created_at AS createdAt, s.updated_at AS updatedAt,
             (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS messageCount
      FROM chat_sessions s
      ORDER BY s.updated_at DESC
    `).all() as Record<string, unknown>[];

    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      providerId: (r.providerId as number | null) ?? null,
      model: (r.model as string | null) ?? null,
      mode: (r.mode as string) ?? "default",
      effort: (r.effort as string) ?? "medium",
      summary: (r.summary as string | null) ?? null,
      messageCount: Number(r.messageCount ?? 0),
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    }));
  }

  public getById(db: Database.Database, id: string): ChatSessionMeta | null {
    const r = db.prepare(`
      SELECT s.id, s.title, s.provider_id AS providerId, s.model, s.mode, s.effort,
             s.summary, s.created_at AS createdAt, s.updated_at AS updatedAt,
             (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS messageCount
      FROM chat_sessions s
      WHERE s.id = ?
    `).get(id) as Record<string, unknown> | undefined;

    if (!r) return null;

    return {
      id: r.id as string,
      title: r.title as string,
      providerId: (r.providerId as number | null) ?? null,
      model: (r.model as string | null) ?? null,
      mode: (r.mode as string) ?? "default",
      effort: (r.effort as string) ?? "medium",
      summary: (r.summary as string | null) ?? null,
      messageCount: Number(r.messageCount ?? 0),
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    };
  }

  public create(db: Database.Database, s: ChatSessionMeta): void {
    db.prepare(`
      INSERT INTO chat_sessions (id, title, provider_id, model, mode, effort, summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      s.id,
      s.title,
      s.providerId ?? null,
      s.model ?? null,
      s.mode ?? "default",
      s.effort ?? "medium",
      s.summary ?? null,
      s.createdAt,
      s.updatedAt,
    );
  }

  public update(db: Database.Database, id: string, patch: Partial<ChatSessionMeta>): void {
    const sets: string[] = [];
    const args: unknown[] = [];

    if (patch.title !== undefined) {
      sets.push("title = ?");
      args.push(patch.title);
    }
    if (patch.providerId !== undefined) {
      sets.push("provider_id = ?");
      args.push(patch.providerId);
    }
    if (patch.model !== undefined) {
      sets.push("model = ?");
      args.push(patch.model);
    }
    if (patch.mode !== undefined) {
      sets.push("mode = ?");
      args.push(patch.mode);
    }
    if (patch.effort !== undefined) {
      sets.push("effort = ?");
      args.push(patch.effort);
    }
    if (patch.summary !== undefined) {
      sets.push("summary = ?");
      args.push(patch.summary);
    }

    if (sets.length > 0) {
      sets.push("updated_at = ?");
      args.push(Date.now(), id);
      db.prepare(`UPDATE chat_sessions SET ${sets.join(", ")} WHERE id = ?`).run(...args);
    }
  }

  public delete(db: Database.Database, id: string): void {
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM chat_messages WHERE session_id = ?").run(id);
      db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id);
    });
    tx();
  }
}

export const conversationRepo = new SqliteConversationRepository();
