/**
 * Memory service layer for phryvos-k9 permanent AI memories.
 *
 * Importers/callers:
 *   - app/api/memories/route.ts
 *   - app/api/memories/[id]/route.ts
 *   - lib/agent/tools.ts
 *   - lib/chat-service.ts
 *
 * Affected API:
 *   - GET /api/memories
 *   - POST /api/memories
 *   - DELETE /api/memories/:id
 *   - PATCH /api/memories/:id
 *
 * Data schemas if any:
 *   - memories table (id, point, category, created_at, updated_at)
 *
 * User instruction verbatim: "3. ek memmory system bhi hona chahiye ai ke liye jisme vo points bana ke chijo ko permanentlt yaad rakhe jinko users khud se kahe ki ye chij yaad rakhna ya permanently save kar lo"
 */

import type Database from "better-sqlite3";

export interface MemoryItem {
  id: number;
  point: string;
  category: string;
  createdAt: number;
  updatedAt: number;
}

export function listMemories(db: Database.Database): MemoryItem[] {
  const rows = db
    .prepare("SELECT id, point, category, created_at, updated_at FROM memories ORDER BY created_at DESC")
    .all() as Array<{
      id: number;
      point: string;
      category: string | null;
      created_at: number;
      updated_at: number;
    }>;

  return rows.map((r) => ({
    id: r.id,
    point: r.point,
    category: r.category ?? "fact",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function addMemory(
  db: Database.Database,
  point: string,
  category = "fact",
): MemoryItem {
  const cleanPoint = point.trim();
  if (!cleanPoint) throw new Error("Memory point cannot be empty");

  const now = Date.now();
  const res = db
    .prepare("INSERT INTO memories (point, category, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(cleanPoint, category, now, now);

  const id = Number(res.lastInsertRowid);
  return {
    id,
    point: cleanPoint,
    category,
    createdAt: now,
    updatedAt: now,
  };
}

export function deleteMemory(db: Database.Database, id: number): boolean {
  const res = db.prepare("DELETE FROM memories WHERE id = ?").run(id);
  return res.changes > 0;
}

export function updateMemory(
  db: Database.Database,
  id: number,
  point: string,
): boolean {
  const cleanPoint = point.trim();
  if (!cleanPoint) throw new Error("Memory point cannot be empty");

  const now = Date.now();
  const res = db
    .prepare("UPDATE memories SET point = ?, updated_at = ? WHERE id = ?")
    .run(cleanPoint, now, id);

  return res.changes > 0;
}
