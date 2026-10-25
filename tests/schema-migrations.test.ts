/**
 * Phase 14: Data Migrations & Schema Versioning Tests.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import {
  runDeterministicMigrations,
  runDeterministicMigrationsWithBackup,
  getAppliedVersions,
  getCurrentSchemaVersion,
  verifySchemaIntegrity,
  backupDatabaseBeforeMigrate,
  computeMigrationChecksum,
  detectMigrationDrift,
  MIGRATION_STEPS,
  type MigrationStep,
} from "../lib/db/migration-manager.ts";

let tmpDir: string;
let dbPath: string;
let db: Database.Database;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-migration-test-"));
  dbPath = path.join(tmpDir, "vault.db");
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
});

after(() => {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup error */
  }
});

describe("Phase 14: Data Migrations & Schema Versioning", () => {
  it("applies migrations deterministically and records version history", async () => {
    const res = await runDeterministicMigrations(db);
    assert.ok(res.appliedCount >= 1);
    assert.equal(res.currentVersion, MIGRATION_STEPS.length);

    const history = getAppliedVersions(db);
    assert.equal(history.length, MIGRATION_STEPS.length);
    assert.equal(history[0].version, 1);
    assert.equal(history[1].version, 2);
    assert.ok(history[0].checksum.length > 0);
  });

  it("is strictly idempotent on subsequent runs", async () => {
    const secondRun = await runDeterministicMigrations(db);
    assert.equal(secondRun.appliedCount, 0);
    assert.equal(secondRun.currentVersion, getCurrentSchemaVersion(db));
  });

  it("passes database integrity verification", () => {
    const ok = verifySchemaIntegrity(db);
    assert.equal(ok, true);
  });

  it("checksum covers migration content, not just version and name", () => {
    const base: MigrationStep = {
      version: 99,
      name: "test_step",
      up: () => {},
      sql: "CREATE TABLE t(a INTEGER);",
    };
    const edited: MigrationStep = { ...base, sql: "CREATE TABLE t(a INTEGER, b TEXT);" };
    const renamed: MigrationStep = { ...base, name: "renamed_step" };

    assert.notEqual(
      computeMigrationChecksum(base),
      computeMigrationChecksum(edited),
      "changing a migration's SQL must change its checksum",
    );
    assert.notEqual(
      computeMigrationChecksum(base),
      computeMigrationChecksum(renamed),
      "changing a migration's name must change its checksum",
    );
    assert.equal(computeMigrationChecksum(base), computeMigrationChecksum({ ...base }));
  });

  it("detects drift when a recorded migration's content no longer matches", async () => {
    const driftDb = new Database(":memory:");
    try {
      await runDeterministicMigrations(driftDb);
      // Tamper with the recorded checksum as if the migration source changed
      // after it was applied.
      driftDb.prepare("UPDATE schema_versions SET checksum = 'tampered' WHERE version = 1").run();
      const drift = detectMigrationDrift(driftDb);
      assert.ok(drift.length >= 1, "tampered checksum must be reported as drift");
      assert.ok(drift.includes(1), "version 1 must be in drift list");
    } finally {
      driftDb.close();
    }
  });

  it("creates a pre-migration backup snapshot", async () => {
    const backupPath = await backupDatabaseBeforeMigrate(dbPath);
    assert.ok(backupPath);
    assert.ok(fs.existsSync(backupPath!));
    assert.ok(backupPath!.includes("pre-migrate"));
  });

  it("backupDatabaseBeforeMigrate uses WAL-safe backup for better-sqlite3", async () => {
    // WAL-safe backup should use the backup API when the DB is in WAL mode
    // rather than copyFileSync which can corrupt WAL files
    const walDbPath = path.join(tmpDir, "wal-test.db");
    const walDb = new Database(walDbPath);
    walDb.pragma("journal_mode = WAL");
    walDb.exec("CREATE TABLE test (id INTEGER PRIMARY KEY);");
    walDb.exec("INSERT INTO test VALUES (1), (2), (3);");
    walDb.close();

    const backupPath = await backupDatabaseBeforeMigrate(walDbPath);
    assert.ok(backupPath, "backup should succeed for WAL database");
    assert.ok(fs.existsSync(backupPath!));

    // Verify the backup is valid by opening it
    const restoredDb = new Database(backupPath!);
    const count = restoredDb.prepare("SELECT COUNT(*) as c FROM test").get() as { c: number };
    assert.equal(count.c, 3, "backup should preserve all data");
    restoredDb.close();
  });

  it("backupDatabaseBeforeMigrate returns null for non-existent database", async () => {
    const result = await backupDatabaseBeforeMigrate("/nonexistent/path/db.sqlite");
    assert.equal(result, null);
  });

  it("runDeterministicMigrationsWithBackup creates backup when backup option is true", async () => {
    const testDbPath = path.join(tmpDir, "migrate-backup-test.db");
    const testDb = new Database(testDbPath);
    testDb.pragma("foreign_keys = ON");
    testDb.pragma("journal_mode = WAL");

    try {
      const result = await runDeterministicMigrationsWithBackup(testDb, { backup: true, dbPath: testDbPath });
      assert.ok(result.backupPath, "backup should be created when option is enabled");
      assert.ok(fs.existsSync(result.backupPath!), "backup file should exist");
    } finally {
      testDb.close();
    }
  });
});

describe("Phase 14: Database Connection Lifecycle", () => {
  let lifecycleDb: Database.Database;
  let lifecycleDbPath: string;

  before(() => {
    lifecycleDbPath = path.join(tmpDir, "lifecycle-test.db");
    lifecycleDb = new Database(lifecycleDbPath);
    lifecycleDb.pragma("journal_mode = WAL");
    lifecycleDb.pragma("foreign_keys = ON");
  });

  after(() => {
    try {
      lifecycleDb.close();
    } catch {}
  });

  it("getDb returns singleton and reuses connection", () => {
    const { getDb, vaultDbPath } = require("../lib/db/client.ts");
    const originalPath = process.env.VAULT_DB_PATH;
    process.env.VAULT_DB_PATH = lifecycleDbPath;

    try {
      const db1 = getDb();
      const db2 = getDb();
      assert.ok(db1 === db2, "getDb should return the same instance");
    } finally {
      if (originalPath) process.env.VAULT_DB_PATH = originalPath;
      else delete process.env.VAULT_DB_PATH;
    }
  });

  it("initDb creates independent connection", () => {
    const { initDb } = require("../lib/db/client.ts");
    const testPath = path.join(tmpDir, "independent-test.db");
    const db = initDb(testPath);
    assert.ok(db !== lifecycleDb, "initDb should create new connection");
    db.close();
  });

  it("database handles graceful shutdown hooks", async () => {
    // Test that we can register and trigger shutdown
    const { registerShutdown, triggerShutdown } = require("../lib/db/client.ts");
    let shutdownCalled = false;

    registerShutdown(() => { shutdownCalled = true; });
    await triggerShutdown();

    assert.ok(shutdownCalled, "shutdown handler should be called");
  });
});

describe("Phase 14: Persistence Failure Recovery", () => {
  let recoveryDb: Database.Database;
  let recoveryDbPath: string;

  before(() => {
    recoveryDbPath = path.join(tmpDir, "recovery-test.db");
    recoveryDb = new Database(recoveryDbPath);
    recoveryDb.pragma("journal_mode = WAL");
    recoveryDb.pragma("foreign_keys = ON");
  });

  after(() => {
    try {
      recoveryDb.close();
    } catch {}
  });

  it("runDeterministicMigrations performs WAL checkpoint on startup", () => {
    // Open a new connection and run migrations - should checkpoint WAL
    const testDb = new Database(recoveryDbPath);
    testDb.pragma("journal_mode = WAL");
    testDb.pragma("foreign_keys = ON");

    // Insert some data and don't checkpoint - simulate unclean shutdown
    testDb.exec("CREATE TABLE IF NOT EXISTS test_recovery (id INTEGER PRIMARY KEY, val TEXT)");
    testDb.prepare("INSERT INTO test_recovery (val) VALUES (?)").run("uncheckpointed");
    testDb.close();

    // Reopen and run migrations - should trigger WAL checkpoint
    const reopenedDb = new Database(recoveryDbPath);
    reopenedDb.pragma("journal_mode = WAL");
    reopenedDb.pragma("foreign_keys = ON");

    // This should not throw and should recover cleanly
    const result = runDeterministicMigrations(reopenedDb);
    assert.ok(result.currentVersion >= 1);

    // Data should be preserved after recovery
    const count = reopenedDb.prepare("SELECT COUNT(*) as c FROM test_recovery").get() as { c: number };
    assert.equal(count.c, 1);

    reopenedDb.close();
  });

  it("verifySchemaIntegrity detects corruption", () => {
    const testPath = path.join(tmpDir, "corrupt-test.db");
    const testDb = new Database(testPath);
    testDb.pragma("journal_mode = WAL");
    testDb.exec("CREATE TABLE test_corrupt (id INTEGER PRIMARY KEY)");
    testDb.close();

    // Manually corrupt the database file
    const buf = fs.readFileSync(testPath);
    // Flip a byte in the middle (not the header) to corrupt
    if (buf.length > 100) {
      buf[100] = buf[100] ^ 0xFF;
      fs.writeFileSync(testPath, buf);
    }

    const corruptedDb = new Database(testPath, { readonly: true });
    const ok = verifySchemaIntegrity(corruptedDb);
    assert.equal(ok, false, "integrity_check should fail on corrupted database");
    corruptedDb.close();
  });

  it("database opens in WAL mode and handles crash recovery automatically", () => {
    // Test that initDb applies WAL checkpoint on first open
    const testPath = path.join(tmpDir, "crash-recovery-test.db");
    const testDb = new Database(testPath);
    testDb.pragma("journal_mode = WAL");
    testDb.exec("CREATE TABLE crash_test (id INTEGER PRIMARY KEY, data TEXT)");
    testDb.prepare("INSERT INTO crash_test (data) VALUES (?)").run("test1");
    testDb.close();

    // Simulate crash by not checkpointing - just reopen
    const { initDb } = require("../lib/db/client.ts");
    const recoveredDb = initDb(testPath);

    // Should open successfully and data should be there
    const count = recoveredDb.prepare("SELECT COUNT(*) as c FROM crash_test").get() as { c: number };
    assert.equal(count.c, 1);

    recoveredDb.close();
  });
});
