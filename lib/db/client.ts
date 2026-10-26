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
 * better-sqlite3 works correctly when loaded by either the PRoot/Ubuntu glibc
 * Node binary or the Termux Node binary on ARM64. No runtime assertion needed.
 */
function assertSupportedNodeRuntime(): void {
  // No-op: both glibc (PRoot/Ubuntu) and Termux Node can load better-sqlite3
  // on ARM64. The previous android platform check broke Termux users.
}

/**
 * Process-wide singleton. better-sqlite3's sync API means all writes are
 * serialized by construction; WAL + busy_timeout handle reader/writer overlap.
 * Cached on globalThis so Next dev HMR can't open a second handle.
 */
export function getDb(): Database.Database {
  assertSupportedNodeRuntime();
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
  assertSupportedNodeRuntime();
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

/** Shutdown callbacks registered for graceful database close */
const shutdownCallbacks: Array<() => void | Promise<void>> = [];

/**
 * Register a callback to be called on graceful shutdown.
 * Callbacks are executed in registration order.
 */
export function registerShutdown(callback: () => void | Promise<void>): void {
  shutdownCallbacks.push(callback);
}

/**
 * Trigger all registered shutdown callbacks and close the singleton database.
 * Should be called on process exit signals (SIGTERM, SIGINT, beforeExit).
 */
export async function triggerShutdown(): Promise<void> {
  // Execute all shutdown callbacks in order
  for (const cb of shutdownCallbacks) {
    try {
      await cb();
    } catch (err) {
      console.error("Shutdown callback error:", err);
    }
  }

  // Close the singleton database if it exists
  if (g.__phryvosDb) {
    try {
      g.__phryvosDb.close();
    } catch (err) {
      console.error("Error closing database:", err);
    }
    g.__phryvosDb = undefined;
    g.__phryvosDbPath = undefined;
  }

  // Clear callbacks for potential re-initialization
  shutdownCallbacks.length = 0;
}

/**
 * Initialize process-level shutdown handlers.
 * Call this once at application startup.
 */
let shutdownHandlersInitialized = false;

export function initShutdownHandlers(): void {
  if (shutdownHandlersInitialized) return;
  shutdownHandlersInitialized = true;

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, initiating graceful shutdown...`);
    await triggerShutdown();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("beforeExit", async () => {
    await triggerShutdown();
  });
}
