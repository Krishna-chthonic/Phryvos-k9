import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import {
  createDot,
  getDot,
  updateDot,
  deleteDot,
  createDotTask,
  getDotTask,
  updateDotTask,
  deleteDotTask,
  claimDueDotTask,
  completeDotTask,
  saveDotSpace,
  listDotSpaces,
  deleteDotSpace,
  formatSpacesContext,
  appendDotMessage,
  listDotMessages,
} from "@/lib/dots-service";
import { validateTerminalWorkingDir } from "@/lib/dots/terminal-guard";
import { scrubSecrets } from "@/lib/dots/secret-scrubber";
import { resolveAllowedTools, evaluateAutonomousToolRisk } from "@/lib/dots-runner";
import type { VaultCtx } from "@/lib/providers-service";

function createInMemoryTestContext(): VaultCtx {
  const db = new Database(":memory:");
  const key = crypto.randomBytes(32);
  runMigrations(db);
  return { db, key };
}

test("Phase 5: Dots Hardening & Verification Suite (D-01 to D-30)", async (t) => {
  await t.test("Full lifecycle: Dot creation, update, and cascading cleanup", () => {
    const ctx = createInMemoryTestContext();
    const dot = createDot(ctx, {
      name: "Architect",
      role: "Lead Architect",
      systemPrompt: "Design systems",
      tools: ["terminal", "vault"],
    });

    assert.equal(dot.name, "Architect");
    assert.equal(dot.role, "Lead Architect");

    // Add space and message
    saveDotSpace(ctx, dot.id, { title: "Arch Document", content: "Architecture diagram" });
    appendDotMessage(ctx, dot.id, { role: "user", content: "Hello Architect" });

    assert.equal(listDotSpaces(ctx, dot.id).length, 1);
    assert.equal(listDotMessages(ctx, dot.id).length, 1);

    // Delete Dot and ensure cascade
    deleteDot(ctx, dot.id);
    assert.equal(getDot(ctx, dot.id), null);
    assert.equal(listDotSpaces(ctx, dot.id).length, 0);
    assert.equal(listDotMessages(ctx, dot.id).length, 0);
  });

  await t.test("D-01: Terminal boundary confinement denies path escapes and restricted OS paths", () => {
    const sandbox = "/tmp/dot_sandbox_test";
    const normalResult = validateTerminalWorkingDir(sandbox, "src");
    assert.ok(normalResult.ok);

    const traversalResult = validateTerminalWorkingDir(sandbox, "../../../opt/other");
    assert.equal(traversalResult.ok, false);
    assert.match(traversalResult.error!, /escapes sandbox/);

    const restrictedResult = validateTerminalWorkingDir(sandbox, "/etc");
    assert.equal(restrictedResult.ok, false);
    assert.match(restrictedResult.error!, /restricted system directory/);
  });

  await t.test("D-02: Tool allowlist boundary prevents unauthorized fallback", () => {
    assert.deepEqual(resolveAllowedTools([]), []);
    assert.deepEqual(resolveAllowedTools(undefined), []);
    assert.deepEqual(resolveAllowedTools(null), []);
    assert.deepEqual(resolveAllowedTools(["terminal", "vault"]), ["terminal", "vault"]);
    assert.equal(resolveAllowedTools(["*"]), undefined);
    assert.equal(resolveAllowedTools(["all"]), undefined);
    assert.equal(resolveAllowedTools(["omni"]), undefined);
  });

  await t.test("D-05: Destructive tool evaluation blocks unprompted background execution", () => {
    const blockedTools = ["delete_file", "purge_file", "run_js_code", "execute_terminal", "drop_table"];
    for (const tool of blockedTools) {
      const evalResult = evaluateAutonomousToolRisk(tool, {});
      assert.equal(evalResult.allowed, false, `Tool ${tool} must be blocked`);
    }

    const safeTool = evaluateAutonomousToolRisk("web_search", { query: "Next.js 15" });
    assert.equal(safeTool.allowed, true);

    const rmRf = evaluateAutonomousToolRisk("terminal", { command: "rm -rf /" });
    assert.equal(rmRf.allowed, false);
  });

  await t.test("D-06 & D-07: Background task claim and exponential backoff retry cycle", () => {
    const ctx = createInMemoryTestContext();
    const dot = createDot(ctx, { name: "Worker", role: "Dev", systemPrompt: "Dev", tools: [] });
    const task = createDotTask(ctx, dot.id, {
      prompt: "Periodic healthcheck",
      intervalSeconds: 300,
      nextRunAt: Date.now() - 1000,
      maxRetries: 3,
    });

    // Claim due task
    const claimed = claimDueDotTask(ctx.db);
    assert.ok(claimed);
    assert.equal(claimed.task.id, task.id);
    assert.equal(claimed.task.status, "running");

    // Simulate failure 1
    completeDotTask(ctx.db, task.id, { error: "Network timeout" });
    const retry1 = getDotTask(ctx, task.id);
    assert.equal(retry1?.status, "queued");
    assert.equal(retry1?.retryCount, 1);
    assert.ok(retry1!.nextRunAt! > Date.now());

    // Simulate failure 2
    completeDotTask(ctx.db, task.id, { error: "Network timeout 2" });
    const retry2 = getDotTask(ctx, task.id);
    assert.equal(retry2?.status, "queued");
    assert.equal(retry2?.retryCount, 2);

    // Simulate failure 3 (exhausts maxRetries)
    completeDotTask(ctx.db, task.id, { error: "Network timeout 3" });
    const retry3 = getDotTask(ctx, task.id);
    assert.equal(retry3?.status, "failed");
    assert.equal(retry3?.retryCount, 3);
  });

  await t.test("D-14: Canonical tool calls and tool results serialization in history", () => {
    const ctx = createInMemoryTestContext();
    const dot = createDot(ctx, { name: "Agent", role: "Dev", systemPrompt: "Dev", tools: [] });

    appendDotMessage(ctx, dot.id, {
      role: "assistant",
      content: "Invoking search tool.",
      toolCalls: [
        {
          id: "call_search_1",
          type: "function",
          function: { name: "web_search", arguments: JSON.stringify({ query: "OpenAI" }) },
        },
      ],
    });

    appendDotMessage(ctx, dot.id, {
      role: "tool",
      content: "Found 10 results.",
      toolCallId: "call_search_1",
      toolName: "web_search",
    });

    const msgs = listDotMessages(ctx, dot.id);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].toolCalls?.[0]?.id, "call_search_1");
    assert.equal(msgs[1].toolCallId, "call_search_1");
  });

  await t.test("D-19: Secret scrubber removes sensitive credentials from outputs", () => {
    const dirty = "Exported key: sk-proj-1234567890abcdef1234567890abcdef and token Bearer mysecrettoken1234567890";
    const clean = scrubSecrets(dirty);
    assert.ok(!clean.includes("sk-proj-1234567890abcdef1234567890abcdef"));
    assert.ok(!clean.includes("mysecrettoken1234567890"));
  });
});
