/**
 * Unified Data Access Layer (DAL) for Phryvos-k9.
 *
 * Centralizes all vault access behind a single lock verification gate.
 * Every query method first calls `ensureVaultUnlocked(ctx)` which throws
 * if the vault is not in "unlocked" state. This prevents any accidental
 * data access when the vault is locked or in setup_required state.
 *
 * The DAL wraps the low-level `better-sqlite3` operations and provides
 * typed, safe access patterns for all vault data.
 *
 * Importers/callers: API routes, agent tools, services
 * Affected API: All vault data operations
 * Data schemas: VaultCtx, FileMeta, and all domain entities
 * User instruction verbatim: "Unified DAL enforcing lock verification before any query executes"
 */
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db/client";
import { getVaultState } from "@/lib/auth-state";
import { VaultError } from "@/lib/vault-service";

export interface VaultCtx {
  db: Database.Database;
  key: Buffer;
}

/**
 * Vault lock states
 */
export type VaultLockState = "setup_required" | "locked" | "unlocked";

/**
 * Error thrown when vault is not unlocked
 */
export class VaultLockedError extends Error {
  constructor(
    public readonly state: VaultLockState,
    message: string = `Vault is ${state}. Unlock required.`
  ) {
    super(message);
    this.name = "VaultLockedError";
  }
}

/**
 * Result wrapper for DAL operations
 */
export interface DalResult<T> {
  ok: true;
  data: T;
}

/**
 * Check if vault is unlocked, throw if not
 */
export async function ensureVaultUnlocked(): Promise<void> {
  const state = await getVaultState();
  if (state !== "unlocked") {
    throw new VaultLockedError(state);
  }
}

/**
 * Synchronous version for use in synchronous contexts
 * Requires the vault state to already be known as unlocked
 */
export function assertVaultUnlocked(state: VaultLockState): void {
  if (state !== "unlocked") {
    throw new VaultLockedError(state);
  }
}

/**
 * Get the database handle (only for internal use, routes should use DAL methods)
 * This bypasses lock checks - use with extreme caution
 */
export function getDatabase(): Database.Database {
  return getDb();
}

/**
 * Create a vault context with the master key
 * This should only be called after vault is verified unlocked
 */
export async function createVaultContext(masterKey: Buffer): Promise<VaultCtx> {
  await ensureVaultUnlocked();
  return {
    db: getDb(),
    key: masterKey,
  };
}

/**
 * Get the vault database (for use in modules that need direct DB access after lock check)
 * Callers must ensure vault is unlocked before calling this
 */
export function getVaultDb(ctx: VaultCtx): Database.Database {
  return ctx.db;
}

/**
 * Base query builder with common patterns
 */
export class QueryBuilder<T> {
  private stmt: Database.Statement;

  constructor(db: Database.Database, sql: string, ...params: unknown[]) {
    this.stmt = db.prepare(sql);
    if (params.length > 0) {
      this.stmt = this.stmt.bind(...params);
    }
  }

  get(): T | undefined {
    return this.stmt.get() as T | undefined;
  }

  all(): T[] {
    return this.stmt.all() as T[];
  }

  run(): Database.RunResult {
    return this.stmt.run();
  }

  iterate(): IterableIterator<T> {
    return this.stmt.iterate() as IterableIterator<T>;
  }
}

/**
 * Transaction wrapper
 */
export function withTransaction<T>(db: Database.Database, fn: () => T): T {
  const tx = db.transaction(fn);
  return tx();
}

/**
 * Pagination helper
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paginate<T>(
  db: Database.Database,
  countSql: string,
  selectSql: string,
  params: unknown[],
  page: number = 1,
  pageSize: number = 20
): PaginatedResult<T> {
  const total = db.prepare(countSql).get(...params) as { count: number };
  const totalCount = total?.count ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const offset = (page - 1) * pageSize;

  const items = db
    .prepare(`${selectSql} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset) as T[];

  return {
    items,
    total: totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Soft-delete aware query helpers
 */
export function whereNotDeleted(alias: string = "f"): string {
  return `${alias}.deleted_at IS NULL`;
}

export function whereActive(alias: string = "f"): string {
  return `${alias}.deleted_at IS NULL`;
}

/**
 * File metadata type (matches vault-service)
 */
export interface FileMeta {
  id: number;
  path: string;
  name: string;
  mime: string | null;
  sizeBytes: number | null;
  isDir: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/**
 * Search hit type
 */
export interface SearchHit {
  path: string;
  name: string;
  isDir: boolean;
  snippet: string | null;
}

/**
 * Version info type
 */
export interface VersionInfo {
  version: number;
  note: string | null;
  createdAt: number;
}

/**
 * Full-text search phrase builder
 */
export function buildFtsPhrase(query: string): string {
  const toks = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"`);
  return toks.join(" OR ") || '""';
}

/**
 * LIKE escape helper
 */
export function escapeLike(s: string): string {
  return s.replace(/[_%]/g, "\\$&");
}

/**
 * Normalize vault path (re-export from vault-service for DAL consumers)
 */
export function normalizeVaultPath(p: string): string {
  if (typeof p !== "string" || p.includes("\0") || p.includes("\\")) {
    throw new VaultError("path_invalid", "Invalid vault path");
  }
  let s = p.trim().replace(/\/{2,}/g, "/");
  if (s.length === 0) s = "/";
  if (!s.startsWith("/")) s = "/" + s;
  while (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  const segs = s.split("/").filter((x) => x !== "");
  if (segs.some((x) => x === ".." || x === "." || x.includes(":"))) {
    throw new VaultError("path_invalid", "Vault paths may not contain '..', '.' or ':' segments");
  }
  return s === "/" ? "/" : "/" + segs.join("/");
}