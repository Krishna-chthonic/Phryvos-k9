/**
 * Data Ownership & AI-vs-User State Governance.
 *
 * Implements strict ownership boundaries and invariant enforcement:
 * 1. User-owned data: user messages, user files, notes, flashcards, settings, user-curated memories.
 * 2. Agent-owned state: reasoning traces, tool executions, background jobs, daemon tasks, temporary caches.
 * 3. Tombstone system: AI cannot resurrect, overwrite, or silently recreate user-deleted data.
 */

import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { AppError } from "../errors/app-error";

export type DataOwnershipRole = "user" | "agent" | "system";

export interface OwnershipMetadata {
  owner: DataOwnershipRole;
  immutableForAgent?: boolean;
  tombstoned?: boolean;
}

/**
 * Normalizes memory content for hashing:
 * Trims whitespace, collapses internal whitespace, converts to lowercase.
 */
export function normalizeMemoryContent(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Computes deterministic SHA-256 hash for memory content.
 */
export function hashMemoryContent(content: string): string {
  return createHash("sha256").update(normalizeMemoryContent(content)).digest("hex");
}

/**
 * Records a tombstone for deleted user data to prevent AI resurrection.
 */
export function recordMemoryTombstone(db: Database.Database, content: string): void {
  const hash = hashMemoryContent(content);
  const now = Date.now();
  db.prepare(`
    INSERT INTO memory_tombstones (content_hash, deleted_at)
    VALUES (?, ?)
    ON CONFLICT(content_hash) DO UPDATE SET deleted_at = excluded.deleted_at
  `).run(hash, now);
}

/**
 * Checks whether content has been tombstoned (deleted by user).
 */
export function isMemoryTombstoned(db: Database.Database, content: string): boolean {
  const hash = hashMemoryContent(content);
  const row = db.prepare("SELECT 1 FROM memory_tombstones WHERE content_hash = ?").get(hash);
  return Boolean(row);
}

/**
 * Removes a tombstone when the user explicitly chooses to recreate the data.
 */
export function removeMemoryTombstone(db: Database.Database, content: string): boolean {
  const hash = hashMemoryContent(content);
  const res = db.prepare("DELETE FROM memory_tombstones WHERE content_hash = ?").run(hash);
  return res.changes > 0;
}

/**
 * Lists all active memory tombstones.
 */
export function listMemoryTombstones(
  db: Database.Database,
): Array<{ id: number; content_hash: string; deleted_at: number }> {
  return db
    .prepare("SELECT id, content_hash, deleted_at FROM memory_tombstones ORDER BY deleted_at DESC")
    .all() as Array<{ id: number; content_hash: string; deleted_at: number }>;
}

/**
 * Asserts mutation permissions based on role and tombstone status.
 */
export function assertCanMutate(
  actor: DataOwnershipRole,
  targetOwner: DataOwnershipRole,
  isTombstoned = false,
): void {
  if (actor === "system" || actor === "user") {
    return;
  }

  // Agent cannot recreate tombstoned user data
  if (actor === "agent" && isTombstoned) {
    throw new AppError({
      code: "FORBIDDEN",
      safeMessage: "AI cannot resurrect or recreate user-deleted data.",
      statusCode: 403,
      retryable: false,
    });
  }

  // Agent cannot overwrite user-owned data directly
  if (actor === "agent" && targetOwner === "user") {
    throw new AppError({
      code: "FORBIDDEN",
      safeMessage: "AI does not have permission to overwrite user-owned data without explicit approval.",
      statusCode: 403,
      retryable: false,
    });
  }
}
