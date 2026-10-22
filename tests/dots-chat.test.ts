import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { runMigrations } from "@/lib/db/migrate";
import {
  createDot,
  appendDotMessage,
  listDotMessages,
  saveDotSpace,
  listDotSpaces,
} from "@/lib/dots-service";
import type { VaultCtx } from "@/lib/providers-service";

function createInMemoryTestContext(): VaultCtx {
  const db = new Database(":memory:");
  const key = crypto.randomBytes(32);
  runMigrations(db);
  return { db, key };
}

test("Phase 3 & 4: Chat Correctness, Tool History & Spaces Context (D-12 to D-17)", async (t) => {
  await t.test("D-14: Canonical tool-call history serialization in Dot messages", async () => {
    const ctx = createInMemoryTestContext();
    const dot = createDot(ctx, { name: "Agent", role: "Dev", systemPrompt: "Dev", tools: ["terminal"] });

    // Append assistant message that initiated a tool call
    const toolCalls = [
      {
        id: "call_abc123",
        type: "function" as const,
        function: { name: "terminal", arguments: JSON.stringify({ command: "pwd" }) },
      },
    ];

    const assistantMsg = appendDotMessage(ctx, dot.id, {
      role: "assistant",
      content: "Let me check the current working directory.",
      toolCalls,
    });

    assert.ok(assistantMsg.id);
    assert.deepEqual(assistantMsg.toolCalls, toolCalls, "Tool calls must be stored and returned on assistant messages");

    // Append corresponding tool result message
    const toolMsg = appendDotMessage(ctx, dot.id, {
      role: "tool",
      content: "/workspace/projects",
      toolCallId: "call_abc123",
      toolName: "terminal",
    });

    assert.equal(toolMsg.toolCallId, "call_abc123", "Tool message must preserve matching toolCallId");

    // Verify history retrieves both correctly
    const history = listDotMessages(ctx, dot.id);
    assert.equal(history.length, 2);
    assert.deepEqual(history[0].toolCalls, toolCalls);
    assert.equal(history[1].toolCallId, "call_abc123");
  });

  await t.test("D-17: Spaces knowledge base is formatted and injectable into system prompt", async () => {
    const ctx = createInMemoryTestContext();
    const dot = createDot(ctx, { name: "DocBot", role: "Documentation", systemPrompt: "Docs", tools: [] });

    saveDotSpace(ctx, dot.id, { title: "API Guide", content: "Endpoint GET /users returns list of users." });
    saveDotSpace(ctx, dot.id, { title: "Auth Spec", content: "Use Bearer token in Authorization header." });

    const spaces = listDotSpaces(ctx, dot.id);
    assert.equal(spaces.length, 2);

    const { formatSpacesContext } = await import("@/lib/dots-service");
    const formatted = formatSpacesContext(spaces);
    assert.match(formatted, /API Guide/);
    assert.match(formatted, /Endpoint GET \/users/);
    assert.match(formatted, /Auth Spec/);
    assert.match(formatted, /Bearer token/);
  });
});
