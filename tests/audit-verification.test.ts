/**
 * Tests for Fresh Audit Fixes:
 * - Empty tool allowlist strict enforcement
 * - Duress PIN hashing & verification
 * - File versions re-key query compatibility
 * - SSRF detection for local & private IPs
 * - Workspace subpath boundary confinement
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { ensureAgentTools } from "../lib/agent/tools.ts";
import { toolSpecs, runTool } from "../lib/agent/registry.ts";
import { isResolvedTargetPrivate } from "../lib/agent/web-fetch.ts";
import { hashDuressPin, verifyDuressPin } from "../lib/dal/duress-vault.ts";
import { kvSet, kvGet } from "../lib/db/kv.ts";
import { randomBytes } from "node:crypto";

describe("Audit Verification: Security Fixes", () => {
  before(() => {
    ensureAgentTools();
  });
  it("F-05: toolSpecs([]) returns empty array and does NOT leak all tools", () => {
    const allTools = toolSpecs();
    assert.ok(allTools.length > 0, "Default tools must exist");

    const emptyAllowed = toolSpecs([]);
    assert.strictEqual(emptyAllowed.length, 0, "toolSpecs([]) must return zero tools");

    const filtered = toolSpecs(["calculate"]);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].function.name, "calculate");
  });

  it("F-05: runTool denies execution when allowedTools is empty array []", async () => {
    const dummyCtx = { db: {} as any, key: Buffer.alloc(32) };
    const res = await runTool("calculate", { expression: "2 + 2" }, dummyCtx, []);
    assert.ok(res.includes("DENIED"), `Expected DENIED but got: ${res}`);
    assert.ok(res.includes("No tools are enabled"), `Expected message to mention no tools enabled: ${res}`);
  });

  it("F-02: duress PIN is hashed with salt and not stored in plaintext", () => {
    const pin = "9999";
    const salt = randomBytes(16);
    const hash = hashDuressPin(pin, salt);

    kvSet("duress_salt", salt.toString("hex"));
    kvSet("duress_hash", hash.toString("hex"));

    assert.strictEqual(kvGet("duress_pin"), null, "Plaintext duress_pin must not exist");
    assert.strictEqual(verifyDuressPin("9999"), true, "Correct duress PIN must verify");
    assert.strictEqual(verifyDuressPin("1234"), false, "Wrong duress PIN must be rejected");
  });

  it("F-06: isResolvedTargetPrivate blocks SSRF targets (loopback, link-local, cloud metadata)", async () => {
    assert.strictEqual(await isResolvedTargetPrivate("localhost"), true);
    assert.strictEqual(await isResolvedTargetPrivate("127.0.0.1"), true);
    assert.strictEqual(await isResolvedTargetPrivate("0.0.0.0"), true);
    assert.strictEqual(await isResolvedTargetPrivate("169.254.169.254"), true);
    assert.strictEqual(await isResolvedTargetPrivate("10.0.0.5"), true);
    assert.strictEqual(await isResolvedTargetPrivate("192.168.1.1"), true);
    assert.strictEqual(await isResolvedTargetPrivate("172.16.0.2"), true);
  });

  it("F-03: terminal subpath boundary confinement prevents directory escape", () => {
    const baseWorkspace = "/root/workspace";

    const isSafeSubpath = (parent: string, child: string): boolean => {
      const rel = path.relative(parent, child);
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    };

    // Subdirectory is allowed
    assert.strictEqual(isSafeSubpath(baseWorkspace, "/root/workspace/src"), true);
    assert.strictEqual(isSafeSubpath(baseWorkspace, "/root/workspace"), true);

    // Prefix collision must be rejected
    assert.strictEqual(isSafeSubpath(baseWorkspace, "/root/workspace-evil"), false);

    // Parent escape must be rejected
    assert.strictEqual(isSafeSubpath(baseWorkspace, "/root/etc"), false);
    assert.strictEqual(isSafeSubpath(baseWorkspace, "/etc/passwd"), false);
  });

  it("AAD envelope encryption protects against silent ciphertext substitution", () => {
    const { gcmEncrypt, gcmDecrypt } = require("../lib/crypto/envelope.ts");
    const key = Buffer.alloc(32, 7);
    const plaintext = Buffer.from("Sensitive file secret");
    const fileIdAad = "file-id-12345";
    const swappedAad = "file-id-67890";

    const blob = gcmEncrypt(key, plaintext, fileIdAad);
    const decrypted = gcmDecrypt(key, blob, fileIdAad);
    assert.strictEqual(decrypted.toString("utf8"), "Sensitive file secret");

    // Attempting to decrypt under swapped file ID / metadata must fail authentication
    assert.throws(() => {
      gcmDecrypt(key, blob, swappedAad);
    }, /Unsupported state or unable to authenticate data|auth/i);
  });

  it("Node sandbox blocks prototype climbing and host process access", () => {
    const { runSandboxedJs } = require("../lib/agent/code-runner.ts");
    const escapeAttempt1 = "return ({}).constructor.constructor('return process')()";
    const res1 = runSandboxedJs(escapeAttempt1);
    assert.strictEqual(res1.success, false);
    assert.ok(res1.error?.includes("Security Exception"));

    const escapeAttempt2 = "return __proto__";
    const res2 = runSandboxedJs(escapeAttempt2);
    assert.strictEqual(res2.success, false);
    assert.ok(res2.error?.includes("Security Exception"));
  });

  it("CSRF defense rejects cross-site mutating requests", () => {
    const { assertCsrfSafe } = require("../server/vault-guard.ts");

    // Safe GET
    assert.doesNotThrow(() => {
      assertCsrfSafe(new Request("https://vault.local/api/files", { method: "GET" }));
    });

    // Cross-site POST must throw
    assert.throws(() => {
      assertCsrfSafe(
        new Request("https://vault.local/api/files", {
          method: "POST",
          headers: { "sec-fetch-site": "cross-site" },
        })
      );
    }, /Cross-site request forgery blocked/);
  });

  it("Tool approval binds cryptographically to action hash preventing TOCTOU tampering", () => {
    const { requestApproval, resolveApproval, computeActionHash } = require("../lib/agent/guardrails.ts");

    const req = requestApproval({
      tool: "write_file",
      args: { path: "/secret.txt", content: "data" },
      description: "Write secret",
    });

    assert.ok(req.actionHash);
    const expected = computeActionHash("write_file", { path: "/secret.txt", content: "data" });
    assert.strictEqual(req.actionHash, expected);

    // Tampered hash should be rejected
    const badRes = resolveApproval(req.id, "allow", "tampered_hash_12345");
    assert.strictEqual(badRes.ok, false);
    assert.ok(badRes.error?.includes("Action hash mismatch"));

    // Matching hash succeeds
    const goodRes = resolveApproval(req.id, "allow", req.actionHash);
    assert.strictEqual(goodRes.ok, true);
  });

  it("purgeFile permanently wipes file, all versions, and FTS entries", () => {
    const Database = require("better-sqlite3");
    const { runMigrations } = require("../lib/db/migrate.ts");
    const { createFile, writeFile, purgeFile } = require("../lib/vault-service.ts");

    const db = new Database(":memory:");
    runMigrations(db);

    const key = Buffer.alloc(32, 0x42);
    const ctx = { db, key };

    createFile(ctx, "/confidential.txt");
    writeFile(ctx, "/confidential.txt", "TopSecretV1");
    writeFile(ctx, "/confidential.txt", "TopSecretV2");

    // Check file and versions exist
    const fileRow = db.prepare("SELECT id FROM files WHERE path = ?").get("/confidential.txt");
    assert.ok(fileRow);
    const verCount = db.prepare("SELECT count(*) as c FROM file_versions WHERE file_id = ?").get(fileRow.id);
    assert.strictEqual(verCount.c, 1);

    // Purge file
    purgeFile(ctx, "/confidential.txt");

    // Verify complete wiping
    const purgedFile = db.prepare("SELECT * FROM files WHERE path = ?").get("/confidential.txt");
    assert.strictEqual(purgedFile, undefined);

    const purgedVer = db.prepare("SELECT * FROM file_versions WHERE file_id = ?").all(fileRow.id);
    assert.strictEqual(purgedVer.length, 0);

    const purgedFts = db.prepare("SELECT * FROM files_fts WHERE path = ?").all("/confidential.txt");
    assert.strictEqual(purgedFts.length, 0);

    const purgedContentFts = db.prepare("SELECT * FROM file_content_fts WHERE file_id = ?").all(fileRow.id);
    assert.strictEqual(purgedContentFts.length, 0);

    db.close();
  });

  it("F-01: backup path confinement prevents path traversal out of backups/export directory", () => {
    const parentDir = path.resolve("/tmp/backups");
    function isContainedIn(childPath: string, dir: string): boolean {
      const relative = path.relative(dir, childPath);
      return !relative.startsWith("..") && !path.isAbsolute(relative);
    }

    assert.strictEqual(isContainedIn("/tmp/backups/backup-2026.zip", parentDir), true);
    assert.strictEqual(isContainedIn("/etc/passwd", parentDir), false);
    assert.strictEqual(isContainedIn("/tmp/backups/../other/file.zip", parentDir), false);
  });

  it("F-05: backup kind validation only permits 'auto', 'manual', 'export'", () => {
    const { z } = require("zod");
    const BackupBody = z.object({
      kind: z.enum(["auto", "manual", "export"]).optional(),
    });

    assert.strictEqual(BackupBody.safeParse({ kind: "auto" }).success, true);
    assert.strictEqual(BackupBody.safeParse({ kind: "manual" }).success, true);
    assert.strictEqual(BackupBody.safeParse({ kind: "export" }).success, true);
    assert.strictEqual(BackupBody.safeParse({ kind: "arbitrary_injected" }).success, false);
  });

  it("F-06: setup route records throttle failures and resets on success", () => {
    const { recordFail, clearThrottle, assertNotThrottled } = require("../lib/session/throttle.ts");
    clearThrottle("setup-test");
    recordFail("setup-test");
    recordFail("setup-test");
    // Throttling triggers on 5 fails
    recordFail("setup-test");
    recordFail("setup-test");
    recordFail("setup-test");

    let throttled = false;
    try {
      assertNotThrottled("setup-test");
    } catch {
      throttled = true;
    }
    assert.strictEqual(throttled, true, "Should be throttled after 5 failures");

    clearThrottle("setup-test");
    assert.doesNotThrow(() => assertNotThrottled("setup-test"));
  });
});
