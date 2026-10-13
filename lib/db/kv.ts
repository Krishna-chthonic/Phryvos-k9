import { getDb } from "./client";

export function kvGet(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM kv WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function kvSet(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, Date.now());
}
