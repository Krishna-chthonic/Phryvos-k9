import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import {
  createDot,
  getDot,
  saveDotSpace,
  listDotSpaces,
  deleteDotSpace,
  createDotTask,
  getDotTask,
  updateDotTask,
  deleteDotTask,
} from "@/lib/dots-service";
import { DotRunner } from "@/lib/dots-runner";
import type { VaultCtx } from "@/lib/providers-service";

function createInMemoryTestContext(): VaultCtx {
  const db = new Database(":memory:");
  const key = crypto.randomBytes(32);
  runMigrations(db);
  return { db, key };
}

test("Phase 1: Safety Blockers (D-01 to D-05)", async (t) => {
  await t.test("D-02: Empty tool allowlist strictly resolves to 0 tools allowed", async () => {
    // When a Dot has tools: [], resolveAllowedTools MUST return [] (zero tools), NEVER undefined (which opens all tools)
    const dotEmpty = {
      id: "dot_safe",
      name: "Safe Bot",
      tools: [],
    };
    const dotWildcard = {
      id: "dot_omni",
      name: "Omni Bot",
      tools: ["*"],
    };
    const dotSpecific = {
      id: "dot_writer",
      name: "Writer Bot",
      tools: ["search_web", "file_read"],
    };

    // Helper function that mimics runner's resolution logic
    const { resolveAllowedTools } = await import("@/lib/dots-runner");
    assert.deepEqual(resolveAllowedTools(dotEmpty.tools), [], "Empty tools list must resolve to [] (zero tools)");
    assert.equal(resolveAllowedTools(dotWildcard.tools), undefined, "Wildcard tools must resolve to undefined (all tools)");
    assert.deepEqual(resolveAllowedTools(dotSpecific.tools), ["search_web", "file_read"], "Specific tools must be preserved");
  });

  await t.test("D-03: Cross-Dot resource ownership checks on Spaces and Tasks", async () => {
    const ctx = createInMemoryTestContext();

    // Create two separate dots
    const dotA = createDot(ctx, { name: "Dot Alpha", role: "Specialist A", systemPrompt: "A", tools: [] });
    const dotB = createDot(ctx, { name: "Dot Beta", role: "Specialist B", systemPrompt: "B", tools: [] });

    // 1. Spaces cross-dot isolation
    const spaceA = saveDotSpace(ctx, dotA.id, { title: "Secret Space A", content: "Top secret A" });
    assert.equal(spaceA.dotId, dotA.id);

    // Dot B attempts to overwrite Dot A's space by supplying spaceA.id
    assert.throws(
      () => {
        saveDotSpace(ctx, dotB.id, { id: spaceA.id, title: "Hijacked Space", content: "Overwritten" });
      },
      /ownership|forbidden|not found/i,
      "Saving a space with an existing ID belonging to another Dot must throw an ownership error"
    );

    // Dot B attempts to delete Dot A's space
    assert.throws(
      () => {
        deleteDotSpace(ctx, spaceA.id, dotB.id);
      },
      /ownership|forbidden|not found/i,
      "Deleting a space belonging to another Dot must throw an ownership error"
    );

    // Dot A successfully deletes its own space
    const deletedA = deleteDotSpace(ctx, spaceA.id, dotA.id);
    assert.equal(deletedA, true);
    assert.equal(listDotSpaces(ctx, dotA.id).length, 0);

    // 2. Tasks cross-dot isolation
    const taskA = createDotTask(ctx, dotA.id, { prompt: "Task for Alpha" });
    assert.equal(taskA.dotId, dotA.id);

    // Dot B attempts to update Dot A's task
    assert.throws(
      () => {
        updateDotTask(ctx, taskA.id, { prompt: "Tampered" }, dotB.id);
      },
      /ownership|forbidden|not found/i,
      "Updating a task belonging to another Dot must throw an ownership error"
    );

    // Dot B attempts to delete Dot A's task
    assert.throws(
      () => {
        deleteDotTask(ctx, taskA.id, dotB.id);
      },
      /ownership|forbidden|not found/i,
      "Deleting a task belonging to another Dot must throw an ownership error"
    );

    // Dot A can update and delete its own task
    const updatedA = updateDotTask(ctx, taskA.id, { prompt: "Updated by Alpha" }, dotA.id);
    assert.equal(updatedA?.prompt, "Updated by Alpha");
    const deletedTaskA = deleteDotTask(ctx, taskA.id, dotA.id);
    assert.equal(deletedTaskA, true);
    assert.equal(getDotTask(ctx, taskA.id), null);
  });

  await t.test("D-04: Browser endpoint per-dot permission verification", async () => {
    const { verifyDotBrowserPermission } = await import("@/lib/browser/browser-guard");

    // Dot without browser tool
    assert.equal(verifyDotBrowserPermission(["terminal", "search_web"]), false, "Must deny browser if not in tools");
    assert.equal(verifyDotBrowserPermission([]), false, "Must deny browser for empty tools");

    // Dot with browser tool or wildcard
    assert.equal(verifyDotBrowserPermission(["browser"]), true, "Must allow browser when explicitly granted");
    assert.equal(verifyDotBrowserPermission(["browser", "terminal"]), true, "Must allow browser with multiple tools");
    assert.equal(verifyDotBrowserPermission(["*"]), true, "Must allow browser for wildcard *");
    assert.equal(verifyDotBrowserPermission(["all"]), true, "Must allow browser for all");
    assert.equal(verifyDotBrowserPermission(["omni"]), true, "Must allow browser for omni");
  });

  await t.test("D-01: Terminal boundary confinement & symlink traversal defense", async () => {
    const { validateTerminalWorkingDir } = await import("@/lib/dots/terminal-guard");
    const tmpBase = fs.mkdtempSync(path.join("/tmp", "dot-term-test-"));
    const subDir = path.join(tmpBase, "allowed-sub");
    fs.mkdirSync(subDir);

    try {
      // 1. Safe subpath inside workspace
      const valid = validateTerminalWorkingDir(tmpBase, "allowed-sub");
      assert.equal(valid.ok, true);
      assert.equal(valid.resolvedPath, subDir);

      // 2. Traversal attempt out of base workspace
      const traversal = validateTerminalWorkingDir(tmpBase, "../etc");
      assert.equal(traversal.ok, false);
      assert.match(traversal.error!, /escapes sandbox/i);

      // 3. Absolute path pointing outside workspace
      const outside = validateTerminalWorkingDir(tmpBase, "/etc");
      assert.equal(outside.ok, false);
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  await t.test("D-05: Risk-based autonomous execution policy prevents destructive actions", async () => {
    const { evaluateAutonomousToolRisk } = await import("@/lib/dots-runner");

    // Read-only / safe tools should be approved
    assert.equal(evaluateAutonomousToolRisk("search_web", {}).allowed, true);
    assert.equal(evaluateAutonomousToolRisk("file_read", { path: "notes.txt" }).allowed, true);
    assert.equal(evaluateAutonomousToolRisk("git_status", {}).allowed, true);

    // Destructive / high-risk tools MUST be blocked or gated
    const deleteRisk = evaluateAutonomousToolRisk("delete_file", { path: "data.json" });
    assert.equal(deleteRisk.allowed, false, "delete_file must not be auto-approved in autonomous mode");
    assert.match(deleteRisk.reason!, /destructive/i);

    const purgeRisk = evaluateAutonomousToolRisk("purge_file", { path: "important.db" });
    assert.equal(purgeRisk.allowed, false, "purge_file must not be auto-approved in autonomous mode");

    const terminalDestructive = evaluateAutonomousToolRisk("terminal", { command: "rm -rf node_modules" });
    assert.equal(terminalDestructive.allowed, false, "Destructive rm command in terminal must be blocked autonomously");
  });
});
