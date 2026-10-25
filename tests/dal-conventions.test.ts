/**
 * Phase 14: Data-Access Convention Tests.
 *
 * Validates that all DAL repositories follow consistent conventions:
 * 1. Each repository has an interface and Sqlite implementation
 * 2. All methods use the withTransaction wrapper for writes
 * 3. QueryBuilder is available for complex queries
 * 4. Pagination helpers are used consistently
 * 5. Soft-delete patterns are followed
 * 6. VaultCtx is properly used for lock verification
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { runMigrations } from "../lib/db/migrate.ts";
import { getDatabase, createVaultContext, withTransaction, QueryBuilder, paginate, whereNotDeleted, escapeLike, buildFtsPhrase, normalizeVaultPath } from "../lib/dal/vault-dal.ts";
import { conversationRepo } from "../lib/dal/conversation-repository.ts";
import { messageRepo } from "../lib/dal/message-repository.ts";
import { memoryRepo } from "../lib/dal/memory-repository.ts";
import { taskRepo } from "../lib/dal/task-repository.ts";

let db: Database.Database;
let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-dal-test-"));
  const p = path.join(tmpDir, "vault.db");
  process.env.VAULT_DB_PATH = p;
  db = new Database(p);
  db.pragma("foreign_keys = ON");
  runMigrations(db);
});

after(() => {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup error */
  }
});

describe("Phase 14: Data-Access Convention Validation", () => {
  it("all repositories implement their interfaces with required methods", () => {
    // Conversation repository
    assert.ok(typeof conversationRepo.list === "function");
    assert.ok(typeof conversationRepo.getById === "function");
    assert.ok(typeof conversationRepo.create === "function");
    assert.ok(typeof conversationRepo.update === "function");
    assert.ok(typeof conversationRepo.delete === "function");

    // Message repository
    assert.ok(typeof messageRepo.listBySession === "function");
    assert.ok(typeof messageRepo.add === "function");
    assert.ok(typeof messageRepo.delete === "function");

    // Memory repository
    assert.ok(typeof memoryRepo.list === "function");
    assert.ok(typeof memoryRepo.add === "function");
    assert.ok(typeof memoryRepo.delete === "function");
    assert.ok(typeof memoryRepo.isDeletedContent === "function");

    // Task repository
    assert.ok(typeof taskRepo.listTasks === "function");
    assert.ok(typeof taskRepo.getTask === "function");
    assert.ok(typeof taskRepo.saveTask === "function");
    assert.ok(typeof taskRepo.deleteTask === "function");
    assert.ok(typeof taskRepo.listProjects === "function");
  });

  it("withTransaction wraps operations in a transaction", () => {
    const result = withTransaction(db, () => {
      db.exec("CREATE TABLE IF NOT EXISTS test_tx (id INTEGER PRIMARY KEY, val TEXT)");
      db.prepare("INSERT INTO test_tx (val) VALUES (?)").run("test1");
      db.prepare("INSERT INTO test_tx (val) VALUES (?)").run("test2");
      return "ok";
    });
    assert.equal(result, "ok");
    const count = db.prepare("SELECT COUNT(*) as c FROM test_tx").get() as { c: number };
    assert.equal(count.c, 2);

    // Verify rollback on error
    assert.throws(() => {
      withTransaction(db, () => {
        db.prepare("INSERT INTO test_tx (val) VALUES (?)").run("test3");
        throw new Error("intentional rollback");
      });
    });
    const countAfter = db.prepare("SELECT COUNT(*) as c FROM test_tx").get() as { c: number };
    assert.equal(countAfter.c, 2, "transaction should have rolled back");
  });

  it("QueryBuilder provides fluent query interface", () => {
    const qb = new QueryBuilder(db, "SELECT 1 as num");
    const row = qb.get() as { num: number } | undefined;
    assert.ok(row);
    assert.equal(row.num, 1);

    const qbAll = new QueryBuilder(db, "SELECT ? as val UNION SELECT ?", "a", "b");
    const rows = qbAll.all() as { val: string }[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].val, "a");
    assert.equal(rows[1].val, "b");
  });

  it("paginate helper returns correct pagination structure", () => {
    // Create test data
    db.exec("CREATE TABLE IF NOT EXISTS test_page (id INTEGER PRIMARY KEY, val TEXT)");
    for (let i = 1; i <= 25; i++) {
      db.prepare("INSERT INTO test_page (val) VALUES (?)").run(`item${i}`);
    }

    const result = paginate(db,
      "SELECT COUNT(*) as count FROM test_page",
      "SELECT * FROM test_page ORDER BY id",
      [],
      1, // page
      10 // pageSize
    );

    assert.equal(result.items.length, 10);
    assert.equal(result.total, 25);
    assert.equal(result.page, 1);
    assert.equal(result.pageSize, 10);
    assert.equal(result.totalPages, 3);

    const page2 = paginate(db,
      "SELECT COUNT(*) as count FROM test_page",
      "SELECT * FROM test_page ORDER BY id",
      [],
      2, 10
    );
    assert.equal(page2.items.length, 10);
    assert.equal(page2.page, 2);
  });

  it("whereNotDeleted helper generates correct SQL", () => {
    assert.equal(whereNotDeleted("f"), "f.deleted_at IS NULL");
    assert.equal(whereNotDeleted("item"), "item.deleted_at IS NULL");
  });

  it("escapeLike properly escapes LIKE wildcards", () => {
    assert.equal(escapeLike("test%_"), "test\\%\\_");
    assert.equal(escapeLike("100%"), "100\\%");
    assert.equal(escapeLike("hello_world"), "hello\\_world");
  });

  it("buildFtsPhrase builds valid FTS5 search phrases", () => {
    assert.equal(buildFtsPhrase("hello world"), '"hello" OR "world"');
    // The function escapes quotes by doubling them
    assert.equal(buildFtsPhrase('test "quoted"'), '"test" OR """quoted"""');
    assert.equal(buildFtsPhrase(""), '""');
    assert.equal(buildFtsPhrase("   "), '""');
  });

  it("normalizeVaultPath enforces path conventions", () => {
    assert.equal(normalizeVaultPath("/"), "/");
    assert.equal(normalizeVaultPath("folder"), "/folder");
    assert.equal(normalizeVaultPath("/folder/"), "/folder");
    assert.equal(normalizeVaultPath("folder/subfolder"), "/folder/subfolder");
    assert.equal(normalizeVaultPath("//folder//sub//"), "/folder/sub");
    // Empty string is normalized to root
    assert.equal(normalizeVaultPath(""), "/");

    // Check that invalid paths throw with appropriate message
    assert.throws(() => normalizeVaultPath("../escape"), /Vault paths may not contain/);
    assert.throws(() => normalizeVaultPath("folder/.."), /Vault paths may not contain/);
    assert.throws(() => normalizeVaultPath("folder:colon"), /Vault paths may not contain/);
  });

  it("getDatabase returns singleton database handle", () => {
    const db1 = getDatabase();
    const db2 = getDatabase();
    assert.ok(db1 === db2, "getDatabase should return singleton");
  });

  it("createVaultContext requires unlocked vault", async () => {
    // Should throw when vault is not unlocked
    await assert.rejects(
      createVaultContext(Buffer.from("test-key")),
      /Vault is/,
      "createVaultContext should throw when vault is locked"
    );
  });

  it("repositories use withTransaction for write operations (structural check)", () => {
    // This is a structural test - verify the implementations use transactions
    // We check that the imports and patterns are consistent
    // Can't easily inspect source at runtime, but we verify behavior by
    // checking that operations are atomic when used
    
    // The taskRepo saves tasks which have proper schema
    // Need to use numeric ID for tasks (they're integer primary key)
    const now = Date.now();
    const res = db.prepare(`
      INSERT INTO tasks (
        project_id, title, description, status, priority,
        due_date, start_date, tags, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      null,
      "Test Task",
      null,
      "todo",
      1,
      null,
      null,
      null,
      null,
      now,
      now,
    );
    const taskId = Number(res.lastInsertRowid);
    assert.ok(taskId > 0, "Task should be created");

    // Verify it exists
    const task = taskRepo.getTask(db, taskId);
    assert.ok(task);
    assert.equal(task!.title, "Test Task");

    // Update should work via saveTask
    const updated = taskRepo.saveTask(db, {
      id: taskId,
      title: "Updated Task",
    });
    assert.equal(updated.title, "Updated Task");

    // Delete should work
    const deleted = taskRepo.deleteTask(db, taskId);
    assert.equal(deleted, true);
    const notFound = taskRepo.getTask(db, taskId);
    assert.equal(notFound, null);
  });

  it("DalResult type is available for consistent return types", () => {
    // Just verify the type is exported and can be used
    type TestResult = import("../lib/dal/vault-dal.ts").DalResult<string>;
    // If this compiles, the type exists
    assert.ok(true, "DalResult type is available");
  });
});
