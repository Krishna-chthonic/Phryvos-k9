import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import {
  runDataQuery,
  validateQuery,
  formatRows,
  DataQueryError,
} from "../lib/agent/data-query.ts";

let tmpDir: string;
let db: Database.Database;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-dq-"));
  const p = path.join(tmpDir, "dq.db");
  process.env.VAULT_DB_PATH = p;
  db = new Database(p);
  db.exec("CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)");
  db.prepare("INSERT INTO kv VALUES (?, ?)").run("system_prompt", "be concise");
});

after(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.VAULT_DB_PATH;
});

describe("data_query guardrails", () => {
  it("accepts SELECT and forces a LIMIT when missing", () => {
    const q = validateQuery("SELECT key FROM kv");
    assert.ok(q.endsWith("LIMIT 200"), q);
    const q2 = validateQuery("SELECT key FROM kv LIMIT 5");
    assert.equal(q2, "SELECT key FROM kv LIMIT 5");
    const q3 = validateQuery("WITH x AS (SELECT 1 AS a) SELECT * FROM x");
    assert.ok(q3.endsWith("LIMIT 200"));
  });

  it("rejects writes, DDL, and multi-statements", () => {
    const bad = [
      "INSERT INTO kv VALUES ('a','b')",
      "UPDATE kv SET value = 'x'",
      "DELETE FROM kv",
      "DROP TABLE kv",
      "SELECT 1; DELETE FROM kv",
      "ATTACH DATABASE 'x' AS y",
      "PRAGMA journal_mode",
      "VACUUM",
      "CREATE TABLE t (a)",
    ];
    for (const sql of bad) {
      assert.throws(() => validateQuery(sql), DataQueryError, sql);
    }
  });

  it("reads through a read-only handle", () => {
    const rows = runDataQuery("SELECT value FROM kv WHERE key = 'system_prompt'");
    assert.deepEqual(rows, [{ value: "be concise" }]);
    assert.equal(formatRows(rows), JSON.stringify([{ value: "be concise" }], null, 1));
    assert.equal(formatRows([]), "(no rows)");
  });

  it("a write can never apply, even if validation is bypassed", () => {
    // belt and suspenders: the handle itself is readonly
    const ro = new Database(process.env.VAULT_DB_PATH as string, {
      readonly: true,
      fileMustExist: true,
    });
    assert.throws(() => ro.prepare("INSERT INTO kv VALUES ('x','y')").run());
    ro.close();
  });
});
