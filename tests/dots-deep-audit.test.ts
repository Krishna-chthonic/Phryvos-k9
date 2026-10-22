import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import {
  createDot,
  getDot,
  deleteDot,
  createDotTask,
  getDotTask,
  listDotTasks,
  saveDotSpace,
  listDotSpaces,
  formatSpacesContext,
} from "@/lib/dots-service";
import { resolveAllowedTools } from "@/lib/dots-runner";
import { scrubSecrets } from "@/lib/dots/secret-scrubber";
import type { VaultCtx } from "@/lib/providers-service";

function createInMemoryTestContext(): VaultCtx {
  const db = new Database(":memory:");
  const key = crypto.randomBytes(32);
  runMigrations(db);
  return { db, key };
}

test("Deep Audit & Research: Code-Level Verification", async (t) => {
  await t.test("Issue 1: deleteDot must cascade to dot_tasks to prevent orphaned background tasks", () => {
    const ctx = createInMemoryTestContext();
    ctx.db.pragma("foreign_keys = OFF"); // Simulate environments where PRAGMA foreign_keys is not active
    const dot = createDot(ctx, {
      name: "Researcher",
      role: "AI Researcher",
      systemPrompt: "Research things",
    });

    const task = createDotTask(ctx, dot.id, {
      prompt: "Standing research task",
      intervalSeconds: 3600,
    });

    assert.ok(getDotTask(ctx, task.id));

    // Delete Dot
    deleteDot(ctx, dot.id);

    // Verify task is also deleted and no orphaned tasks remain
    const remainingTask = getDotTask(ctx, task.id);
    assert.equal(remainingTask, null, "dot_tasks must be deleted when its parent Dot is deleted");
  });

  await t.test("Issue 2: listDotTasks with empty dotId must list all tasks across all coworkers", () => {
    const ctx = createInMemoryTestContext();
    const dot1 = createDot(ctx, { name: "DotOne", role: "Dev", systemPrompt: "Dev" });
    const dot2 = createDot(ctx, { name: "DotTwo", role: "Ops", systemPrompt: "Ops" });

    createDotTask(ctx, dot1.id, { prompt: "Task 1", intervalSeconds: 300 });
    createDotTask(ctx, dot2.id, { prompt: "Task 2", intervalSeconds: 600 });

    // When dotId is empty string or undefined (e.g. Telegram /status or /tasks command)
    const allTasksEmpty = listDotTasks(ctx, "");
    assert.ok(allTasksEmpty.length >= 2, "listDotTasks(ctx, '') must return all company tasks");

    const allTasksUndef = listDotTasks(ctx);
    assert.ok(allTasksUndef.length >= 2, "listDotTasks(ctx) must return all company tasks");

    // Specific dotId filtering must still work
    const dot1Tasks = listDotTasks(ctx, dot1.id);
    assert.equal(dot1Tasks.length, 1);
    assert.equal(dot1Tasks[0].dotId, dot1.id);
  });

  await t.test("Issue 3: Tool allowlist boundary strictly confines tools", () => {
    // Coworker with only vault
    const vaultOnly = resolveAllowedTools(["vault"]);
    assert.deepEqual(vaultOnly, ["vault"]);
    assert.ok(!vaultOnly?.includes("terminal"));

    // Empty tools
    const none = resolveAllowedTools([]);
    assert.deepEqual(none, []);
  });

  await t.test("Issue 4: Spaces knowledge base formatting retains structure", () => {
    const ctx = createInMemoryTestContext();
    const dot = createDot(ctx, { name: "Architect", role: "System Architect", systemPrompt: "Arch" });
    saveDotSpace(ctx, dot.id, {
      title: "Security Guidelines",
      content: "Never log raw bearer tokens or credentials.",
    });

    const spaces = listDotSpaces(ctx, dot.id);
    const context = formatSpacesContext(spaces);
    assert.ok(context.includes("# Active Dot Spaces Knowledge Base"));
    assert.ok(context.includes("### Security Guidelines"));
    assert.ok(context.includes("Never log raw bearer tokens or credentials."));
  });

  await t.test("Issue 5: Secret scrubber protects against token leakage in shell outputs", () => {
    const dirtyOutput = "Authorization: Bearer sk-live-9999999999999999999999999999\nDATABASE_URL=postgres://app:mypassword123@db.prod.internal:5432/main";
    const scrubbed = scrubSecrets(dirtyOutput);
    assert.ok(!scrubbed.includes("sk-live-9999999999999999999999999999"));
    assert.ok(!scrubbed.includes("mypassword123"));
  });

  await t.test("Issue 6: Worktree sanitization & branch validation defends against shell injections", async () => {
    const { sanitizeDotSlug, mergeDotWorktree } = await import("@/lib/dots/worktree-service");
    assert.equal(sanitizeDotSlug("../../evil/path"), "evil_path");
    assert.equal(sanitizeDotSlug("dot; rm -rf /"), "dot_rm_-rf");

    // Invalid target branch with shell metacharacters must be rejected
    const res = await mergeDotWorktree("atlas", "main; cat /etc/passwd");
    assert.equal(res.success, false);
    assert.ok(res.message.includes("Invalid target branch"));
  });

  await t.test("Issue 7: Terminal directory guard blocks traversal and restricted paths", async () => {
    const { validateTerminalWorkingDir } = await import("@/lib/dots/terminal-guard");
    const base = "/tmp/phryvos-test-sandbox";

    // Null byte injection
    const nullByteRes = validateTerminalWorkingDir(base, "sub/\0dir");
    assert.equal(nullByteRes.ok, false);
    assert.ok(nullByteRes.error?.includes("null bytes"));

    // Traversal escape
    const escapeRes = validateTerminalWorkingDir(base, "../../etc");
    assert.equal(escapeRes.ok, false);
    assert.ok(escapeRes.error?.includes("escapes sandbox") || escapeRes.error?.includes("restricted"));

    // Restricted system directory
    const sysRes = validateTerminalWorkingDir(base, "/etc/shadow");
    assert.equal(sysRes.ok, false);
  });
});
