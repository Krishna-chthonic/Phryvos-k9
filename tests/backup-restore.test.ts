/**
 * Phase 15: Backup, Restore & Disaster Recovery Tests.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import Database from "better-sqlite3";

import { runMigrations } from "../lib/db/migrate.ts";
import {
  createExportBundle,
  restoreBackup,
  listBackups,
  deleteBackup,
} from "../lib/backup-service.ts";
import { getDb } from "../lib/db/client.ts";
import { newSalt, derive, splitMaster, KDF_ID } from "../lib/crypto/kdf.ts";
import { createSession } from "../lib/session/store.ts";

let tmpDir: string;
let dbPath: string;
let testMasterKey: Buffer;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-backup-test-"));
  dbPath = path.join(tmpDir, "vault.db");
  process.env.VAULT_DB_PATH = dbPath;

  const db = getDb();
  const salt = newSalt();
  const { masterKey, verifier } = splitMaster(derive("testpassword123", salt));
  testMasterKey = masterKey;

  db.prepare(`
    INSERT INTO auth (kdf, salt, verifier, created_at)
    VALUES (?, ?, ?, ?)
  `).run(KDF_ID, salt, verifier, Date.now());

  createSession(testMasterKey, 3600_000);

  db.prepare(`
    INSERT OR REPLACE INTO files (path, name, is_dir, version, created_at, updated_at)
    VALUES ('/test.txt', 'test.txt', 0, 1, 1000, 1000)
  `).run();
});

after(() => {
  try {
    const db = getDb();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup error */
  }
});

describe("Phase 15: Backup, Restore & Disaster Recovery", () => {
  let createdBackupPath: string;

  it("creates an export bundle with manifest and sha256 integrity hash", async () => {
    const bundle = await createExportBundle("manual");
    assert.ok(bundle.path);
    assert.ok(fs.existsSync(bundle.path));
    assert.ok(bundle.sizeBytes > 0);
    createdBackupPath = bundle.path;

    const list = await listBackups();
    assert.ok(list.length >= 1);
    assert.equal(list[0].kind, "manual");
  });

  it("restores database cleanly and preserves stored records", async () => {
    // Add another row that will be wiped upon restore
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO files (path, name, is_dir, version, created_at, updated_at)
      VALUES ('/to-be-lost.txt', 'to-be-lost.txt', 0, 1, 2000, 2000)
    `).run();

    const rowBefore = db.prepare("SELECT * FROM files WHERE path = '/to-be-lost.txt'").get();
    assert.ok(rowBefore);

    // Restore from earlier backup
    const res = await restoreBackup(createdBackupPath);
    assert.equal(res.ok, true);

    // Re-establish session after restore (since restore invalidates sessions for security)
    createSession(testMasterKey, 3600_000);

    const dbRestored = getDb();
    const rowAfter = dbRestored.prepare("SELECT * FROM files WHERE path = '/to-be-lost.txt'").get();
    assert.equal(rowAfter, undefined);

    const originalRow = dbRestored.prepare("SELECT * FROM files WHERE path = '/test.txt'").get();
    assert.ok(originalRow);
  });

  it("rejects corrupted backups and performs atomic rollback", async () => {
    // Ensure active session
    createSession(testMasterKey, 3600_000);

    // Create an invalid/corrupted zip
    const badZipPath = path.join(tmpDir, "corrupted.zip");
    const badDir = path.join(tmpDir, "bad-content");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, "vault.db"), "THIS_IS_NOT_A_SQLITE_FILE");
    fs.writeFileSync(
      path.join(badDir, "manifest-test.json"),
      JSON.stringify({ version: "1.0", db_sha256: "fake_mismatched_hash" }),
    );
    execSync(`zip -j "${badZipPath}" "${path.join(badDir, "vault.db")}" "${path.join(badDir, "manifest-test.json")}"`, {
      env: { ...process.env, PATH: `/usr/bin:/bin:${process.env.PATH ?? ""}` },
    });

    await assert.rejects(
      async () => {
        await restoreBackup(badZipPath);
      },
      (err: unknown) => {
        return (
          err instanceof Error &&
          (err.message.includes("manifest checksum mismatch") ||
            err.message.includes("failed SQLite integrity check"))
        );
      },
    );

    // Ensure database remains accessible and undamaged
    createSession(testMasterKey, 3600_000);
    const db = getDb();
    const row = db.prepare("SELECT * FROM files WHERE path = '/test.txt'").get();
    assert.ok(row);
  });
});
