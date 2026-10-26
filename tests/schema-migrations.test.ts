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
  getAppliedVersions,
  getCurrentSchemaVersion,
  verifySchemaIntegrity,
  backupDatabaseBeforeMigrate,
  MIGRATION_STEPS,
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
  it("applies migrations deterministically and records version history", () => {
    const res = runDeterministicMigrations(db);
    assert.ok(res.appliedCount >= 1);
    assert.equal(res.currentVersion, MIGRATION_STEPS.length);

    const history = getAppliedVersions(db);
    assert.equal(history.length, MIGRATION_STEPS.length);
    assert.equal(history[0].version, 1);
    assert.equal(history[1].version, 2);
    assert.ok(history[0].checksum.length > 0);
  });

  it("is strictly idempotent on subsequent runs", () => {
    const secondRun = runDeterministicMigrations(db);
    assert.equal(secondRun.appliedCount, 0);
    assert.equal(secondRun.currentVersion, getCurrentSchemaVersion(db));
  });

  it("passes database integrity verification", () => {
    const ok = verifySchemaIntegrity(db);
    assert.equal(ok, true);
  });

  it("creates a pre-migration backup snapshot", () => {
    const backupPath = backupDatabaseBeforeMigrate(dbPath);
    assert.ok(backupPath);
    assert.ok(fs.existsSync(backupPath!));
    assert.ok(backupPath!.includes("pre-migrate"));
  });
});
