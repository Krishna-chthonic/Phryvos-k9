import type Database from "better-sqlite3";
import type { PermanentMemory, MemoryCategory } from "../domain/memory";
import {
  isMemoryTombstoned,
  recordMemoryTombstone,
} from "../governance/data-ownership";

export interface MemoryRepository {
  list(db: Database.Database, category?: string): PermanentMemory[];
  add(db: Database.Database, content: string, category?: MemoryCategory): PermanentMemory;
  delete(db: Database.Database, id: number): boolean;
  isDeletedContent(db: Database.Database, content: string): boolean;
}

export class SqliteMemoryRepository implements MemoryRepository {
  public list(db: Database.Database, category?: string): PermanentMemory[] {
    const where = category ? "WHERE category = ?" : "";
    const params = category ? [category] : [];

    const rows = db.prepare(`
      SELECT id, point AS content, category, created_at AS createdAt, updated_at AS updatedAt
      FROM memories
      ${where}
      ORDER BY created_at DESC
    `).all(...params) as Record<string, unknown>[];

    return rows.map((r) => ({
      id: r.id as number,
      content: r.content as string,
      category: (r.category as MemoryCategory) ?? "general",
      tags: [],
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
    }));
  }

  public add(db: Database.Database, content: string, category: MemoryCategory = "general"): PermanentMemory {
    const now = Date.now();
    const res = db.prepare(`
      INSERT INTO memories (point, category, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(content.trim(), category, now, now);

    return {
      id: Number(res.lastInsertRowid),
      content: content.trim(),
      category,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  public delete(db: Database.Database, id: number): boolean {
    const mem = db.prepare("SELECT point FROM memories WHERE id = ?").get(id) as
      | { point: string }
      | undefined;

    if (mem?.point) {
      recordMemoryTombstone(db, mem.point);
    }

    const res = db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    return res.changes > 0;
  }

  public isDeletedContent(db: Database.Database, content: string): boolean {
    return isMemoryTombstoned(db, content);
  }
}

export const memoryRepo = new SqliteMemoryRepository();
