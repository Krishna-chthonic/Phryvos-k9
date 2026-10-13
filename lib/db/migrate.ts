/**
 * Database migrations and virtual/special table initialization.
 *
 * Importers/callers: lib/db/client.ts (runMigrations)
 * Affected API: All vault database tables.
 * Data schemas if any: memories table (id, point, category, created_at, updated_at).
 * User instruction verbatim: "3. ek memmory system bhi hona chahiye ai ke liye jisme vo points bana ke chijo ko permanentlt yaad rakhe jinko users khud se kahe ki ye chij yaad rakhna ya permanently save kar lo"
 */
import path from "node:path";
import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * Apply drizzle SQL migrations (idempotent via the _drizzle_migrations table),
 * then create FTS5 virtual tables that drizzle-kit does not emit.
 */
export function runMigrations(db: Database.Database): void {
  const folder = path.resolve(process.cwd(), "drizzle");
  migrate(drizzle(db), { migrationsFolder: folder });
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(name, path);
    CREATE VIRTUAL TABLE IF NOT EXISTS file_content_fts USING fts5(file_id UNINDEXED, body);
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      point TEXT NOT NULL,
      category TEXT DEFAULT 'fact',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  // The vault root is a materialized directory row (vault-service relies on it).
  db.prepare(
    "INSERT OR IGNORE INTO files (path, name, is_dir, version, created_at, updated_at) VALUES ('/', '/', 1, 1, strftime('%s','now')*1000, strftime('%s','now')*1000)",
  ).run();
}
