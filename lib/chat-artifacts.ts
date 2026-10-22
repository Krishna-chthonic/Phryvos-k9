import type Database from "better-sqlite3";

export interface ArtifactRecord {
  id: string;
  sessionId: string;
  messageId?: string | null;
  title: string;
  type: "html" | "physics" | "react" | "svg" | "code";
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface ArtifactRow {
  id: string;
  session_id: string;
  message_id: string | null;
  title: string;
  type: string;
  content: string;
  created_at: number;
  updated_at: number;
}

function toRecord(r: ArtifactRow): ArtifactRecord {
  return {
    id: r.id,
    sessionId: r.session_id,
    messageId: r.message_id,
    title: r.title,
    type: r.type as ArtifactRecord["type"],
    content: r.content,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createArtifact(
  db: Database.Database,
  input: {
    id: string;
    sessionId: string;
    messageId?: string | null;
    title: string;
    type: "html" | "physics" | "react" | "svg" | "code";
    content: string;
  },
): ArtifactRecord {
  const now = Date.now();
  db.prepare(
    `INSERT INTO artifacts (id, session_id, message_id, title, type, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       type = excluded.type,
       content = excluded.content,
       updated_at = excluded.updated_at`,
  ).run(
    input.id,
    input.sessionId,
    input.messageId ?? null,
    input.title,
    input.type,
    input.content,
    now,
    now,
  );

  const row = db
    .prepare("SELECT * FROM artifacts WHERE id = ?")
    .get(input.id) as ArtifactRow | undefined;
  if (!row) throw new Error(`Failed to create or retrieve artifact: ${input.id}`);
  return toRecord(row);
}

export function listArtifacts(
  db: Database.Database,
  sessionId: string,
): ArtifactRecord[] {
  const rows = db
    .prepare("SELECT * FROM artifacts WHERE session_id = ? ORDER BY created_at DESC")
    .all(sessionId) as ArtifactRow[];
  return rows.map(toRecord);
}

export function getArtifact(
  db: Database.Database,
  id: string,
): ArtifactRecord | null {
  const row = db
    .prepare("SELECT * FROM artifacts WHERE id = ?")
    .get(id) as ArtifactRow | undefined;
  return row ? toRecord(row) : null;
}

export function deleteArtifact(
  db: Database.Database,
  id: string,
): boolean {
  const res = db.prepare("DELETE FROM artifacts WHERE id = ?").run(id);
  return res.changes > 0;
}
