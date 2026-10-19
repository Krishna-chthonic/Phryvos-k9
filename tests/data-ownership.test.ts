/**
 * Phase 13: AI-Owned State vs User-Owned Data & Tombstone Governance Tests.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { runMigrations } from "../lib/db/migrate.ts";
import {
  normalizeMemoryContent,
  hashMemoryContent,
  recordMemoryTombstone,
  isMemoryTombstoned,
  removeMemoryTombstone,
  listMemoryTombstones,
  assertCanMutate,
} from "../lib/governance/data-ownership.ts";
import { addMemory, deleteMemory, listMemories } from "../lib/memory-service.ts";
import { memoryRepo } from "../lib/dal/memory-repository.ts";
import { ensureAgentTools } from "../lib/agent/tools.ts";
import { runTool } from "../lib/agent/registry.ts";
import { AppError } from "../lib/errors/app-error.ts";

let db: Database.Database;
const key = randomBytes(32);
let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-ownership-test-"));
  const p = path.join(tmpDir, "vault.db");
  process.env.VAULT_DB_PATH = p;
  db = new Database(p);
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  ensureAgentTools();
});

after(() => {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup error */
  }
});

describe("Phase 13: Data Ownership & AI Tombstone Governance", () => {
  it("normalizes and hashes memory content deterministically", () => {
    const raw1 = "  User hates   SPAM emails   ";
    const raw2 = "user hates spam emails";
    assert.equal(normalizeMemoryContent(raw1), "user hates spam emails");
    assert.equal(hashMemoryContent(raw1), hashMemoryContent(raw2));
  });

  it("prevents AI from resurrecting user-deleted memories", async () => {
    const ctx = { db, key };

    // 1. User creates a memory
    const mem = addMemory(db, "Never remind me about calculus homework", "preference");
    assert.ok(mem.id > 0);

    // 2. User deletes the memory -> tombstone recorded
    const deleted = deleteMemory(db, mem.id);
    assert.equal(deleted, true);
    assert.equal(isMemoryTombstoned(db, "Never remind me about calculus homework"), true);
    assert.equal(memoryRepo.isDeletedContent(db, "Never remind me about calculus homework"), true);

    // 3. Agent attempts to save the same memory -> rejected
    assert.throws(
      () => {
        addMemory(db, "  never remind me about CALCULUS homework  ", "preference", {
          source: "agent",
        });
      },
      (err: unknown) => {
        return (
          err instanceof Error &&
          err.message.includes("was previously deleted by the user")
        );
      },
    );

    // 4. Agent tool execution receives clean rejection feedback
    const toolResult = await runTool(
      "save_memory",
      { point: "never remind me about calculus homework" },
      ctx,
    );
    assert.ok(toolResult.includes("Refused to save memory"));
    assert.ok(toolResult.includes("was previously deleted by the user"));

    // 5. User explicitly re-creates the memory -> succeeds and removes tombstone
    const reAdded = addMemory(
      db,
      "Never remind me about calculus homework",
      "preference",
      { source: "user" },
    );
    assert.ok(reAdded.id > 0);
    assert.equal(isMemoryTombstoned(db, "Never remind me about calculus homework"), false);
  });

  it("enforces mutation permissions across user, system, and agent roles", () => {
    // User can mutate anything
    assert.doesNotThrow(() => assertCanMutate("user", "user", false));
    assert.doesNotThrow(() => assertCanMutate("user", "agent", false));

    // System can mutate anything
    assert.doesNotThrow(() => assertCanMutate("system", "user", false));
    assert.doesNotThrow(() => assertCanMutate("system", "agent", false));

    // Agent can mutate agent-owned data
    assert.doesNotThrow(() => assertCanMutate("agent", "agent", false));

    // Agent cannot overwrite user-owned data
    assert.throws(
      () => assertCanMutate("agent", "user", false),
      (err: unknown) => err instanceof AppError && err.code === "FORBIDDEN",
    );

    // Agent cannot mutate tombstoned data
    assert.throws(
      () => assertCanMutate("agent", "agent", true),
      (err: unknown) => err instanceof AppError && err.code === "FORBIDDEN",
    );
  });

  it("lists and cleans up memory tombstones", () => {
    recordMemoryTombstone(db, "Temporary point to tombstone");
    assert.equal(isMemoryTombstoned(db, "Temporary point to tombstone"), true);

    const list = listMemoryTombstones(db);
    assert.ok(list.length >= 1);

    const removed = removeMemoryTombstone(db, "Temporary point to tombstone");
    assert.equal(removed, true);
    assert.equal(isMemoryTombstoned(db, "Temporary point to tombstone"), false);
  });
});
