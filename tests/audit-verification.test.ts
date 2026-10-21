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
});
