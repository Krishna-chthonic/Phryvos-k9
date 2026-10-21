/**
 * Database client for Phryvos-k9 vault.
 *
 * Importers/callers: All services (vault-service, backup-service, chat-service, etc.),
 * authentication routes, DAL, duress-vault
 * Affected API: Database connection singleton, migration runner
 * Data schemas: All SQLite tables (files, chat_sessions, study_logs, etc.)
 * User instruction verbatim: "Pure JS, WebAssembly, and in-process SQLite (better-sqlite3)"
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { runDeterministicMigrations } from "./migration-manager";

type GlobalDB = {
  __phryvosDb?: Database.Database;
  __phryvosDbPath?: string;
};

const g = globalThis as unknown as GlobalDB;

/** Vault DB path: $VAULT_DB_PATH or <cwd>/data/vault.db */
export function vaultDbPath(): string {
  return process.env.VAULT_DB_PATH
    ? path.resolve(process.env.VAULT_DB_PATH)
    : path.join(process.cwd(), "data", "vault.db");
}

/**
 * Process-wide singleton. better-sqlite3's sync API means all writes are
 * serialized by construction; WAL + busy_timeout handle reader/writer overlap.
 * Cached on globalThis so Next dev HMR can't open a second handle.
 */
export function getDb(): Database.Database {
  const p = vaultDbPath();
  if (!g.__phryvosDb || g.__phryvosDbPath !== p) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const db = new Database(p);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("mmap_size = 268435456");
    db.pragma("foreign_keys = ON");
    db.pragma("secure_delete = ON");
    db.pragma("auto_vacuum = INCREMENTAL");
    db.pragma("synchronous = NORMAL");
    runDeterministicMigrations(db);
    g.__phryvosDb = db;
    g.__phryvosDbPath = p;
  }
  return g.__phryvosDb;
}

/**
 * Initialize a separate database instance (for decoy vault, etc.)
 * Does not use the global singleton - creates a fresh connection.
 */
export function initDb(dbPath: string): Database.Database {
  const fullPath = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const db = new Database(fullPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("mmap_size = 268435456");
  db.pragma("foreign_keys = ON");
  db.pragma("secure_delete = ON");
  db.pragma("auto_vacuum = INCREMENTAL");
  db.pragma("synchronous = NORMAL");
  runDeterministicMigrations(db);
  return db;
}
