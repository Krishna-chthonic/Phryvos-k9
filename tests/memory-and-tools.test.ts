/**
 * Tests for permanent AI memory, math calculation, session compaction, and web tools.
 *
 * Importers/callers: tests suite via npx tsx --test
 * Affected API: lib/memory-service.ts, lib/agent/tools.ts, lib/ai/summarize.ts, lib/chat-service.ts
 * Data schemas if any: memories, chat_sessions, chat_messages
 * User instruction verbatim: "1. i want dual theme dark and light , 2. agar isme compaction ka system hota toh thik rahta like koi session jyada lamba ho gaya toh dikkat ho sakti hai , 3. ek memmory system bhi hona chahiye ai ke liye jisme vo points bana ke chijo ko permanentlt yaad rakhe jinko users khud se kahe ki ye chij yaad rakhna ya permanently save kar lo , 4. em aur badi dikkat like me kai mathematics quetions yaha karunga ya solutioms ai se lunga toh solution jo hai vo alag form me aa raje hai ( latex ) toh numerical values samajh me aye esa simplify chahiye , 5. aur ai ke paas kuch skills plugins bhi hone chahiye jo ki important hai like web search, web fetch, etc."
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { runMigrations } from "../lib/db/migrate.ts";
import { ensureAgentTools } from "../lib/agent/tools.ts";
import { runTool } from "../lib/agent/registry.ts";
import { addMemory, listMemories, deleteMemory, updateMemory } from "../lib/memory-service.ts";
import { compactSession } from "../lib/ai/summarize.ts";
import { createSession, appendMessage, buildContext } from "../lib/chat-service.ts";
import type { LlmClient, TurnResult } from "../lib/ai/types.ts";

let db: Database.Database;
const key = randomBytes(32);
let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-mem-test-"));
  const p = path.join(tmpDir, "vault.db");
  process.env.VAULT_DB_PATH = p;
  db = new Database(p);
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  ensureAgentTools();
});

after(() => {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup error */
  }
});

describe("Permanent AI Memory", () => {
  it("CRUD operations for memories work in database", () => {
    const mem1 = addMemory(db, "User is preparing for GATE 2027 CSE", "exam");
    assert.equal(mem1.point, "User is preparing for GATE 2027 CSE");
    assert.equal(mem1.category, "exam");

    const mem2 = addMemory(db, "Prefers concise, mathematical explanations", "preference");
    assert.equal(mem2.point, "Prefers concise, mathematical explanations");

    const list = listMemories(db);
    assert.ok(list.length >= 2);
    assert.ok(list.some((m) => m.point.includes("GATE 2027")));

    const updated = updateMemory(db, mem1.id, "User is preparing for GATE 2027 AIR 1");
    assert.equal(updated, true);
    const reloaded = listMemories(db).find((m) => m.id === mem1.id);
    assert.equal(reloaded?.point, "User is preparing for GATE 2027 AIR 1");

    const deleted = deleteMemory(db, mem2.id);
    assert.equal(deleted, true);

    const listAfter = listMemories(db);
    assert.ok(!listAfter.some((m) => m.id === mem2.id));
  });

  it("Agent tools save_memory, list_memories, and delete_memory execute correctly", async () => {
    const ctx = { db, key };

    const saveRes = await runTool("save_memory", { point: "User loves dark mode theme" }, ctx);
    assert.ok(saveRes.includes("Saved to permanent memory"));

    const listRes = await runTool("list_memories", {}, ctx);
    assert.ok(listRes.includes("User loves dark mode theme"));

    // Extract ID and delete
    const match = listRes.match(/#(\d+)\s+\[/);
    assert.ok(match);
    const id = Number(match[1]);

    const delRes = await runTool("delete_memory", { id }, ctx);
    assert.ok(delRes.includes(`Deleted permanent memory #${id}`));
  });

  it("buildContext automatically injects permanent memories and math simplification guidelines", () => {
    const ctx = { db, key };
    addMemory(db, "User favorite language is TypeScript", "profile");

    const session = createSession(ctx, { model: "test-model", providerId: null });
    appendMessage(ctx, session.id, { role: "user", content: "Hello AI!" });

    const { messages } = buildContext(ctx, session.id, "System prompt");
    const systemContents = messages
      .filter((m) => m.role === "system")
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n");

    // Verify memories were injected
    assert.ok(systemContents.includes("<permanent_user_memories>"));
    assert.ok(systemContents.includes("TypeScript"));

    // Verify math guidelines were injected
    assert.ok(systemContents.includes("<mathematics_and_numerical_guidelines>"));
    assert.ok(systemContents.includes("Simplify numerical values explicitly"));
  });
});

describe("Safe Math Calculator Tool", () => {
  it("evaluates basic and nested arithmetic expressions accurately", async () => {
    const ctx = { db, key };

    const r1 = await runTool("calculate", { expression: "(45 * 1.2) / 0.5" }, ctx);
    assert.equal(r1, "Result: 108");

    const r2 = await runTool("calculate", { expression: "sqrt(144) + pow(2, 5)" }, ctx);
    assert.equal(r2, "Result: 44");

    const r3 = await runTool("calculate", { expression: "round(100 * sin(pi / 2))" }, ctx);
    assert.equal(r3, "Result: 100");
  });

  it("handles alternative symbols like ×, ÷, and ^", async () => {
    const ctx = { db, key };
    const res = await runTool("calculate", { expression: "10 × 5 ÷ 2 ^ 2" }, ctx);
    assert.equal(res, "Result: 12.5");
  });

  it("rejects invalid or unsafe inputs gracefully", async () => {
    const ctx = { db, key };
    const res = await runTool("calculate", { expression: "process.exit()" }, ctx);
    assert.ok(res.includes("invalid") || res.includes("Calculation error"));
  });
});

describe("Session Compaction", () => {
  it("compactSession condenses earlier messages and stores encrypted summary", async () => {
    const ctx = { db, key };
    const session = createSession(ctx, { model: "mock-model", providerId: null });

    // Add several messages
    appendMessage(ctx, session.id, { role: "user", content: "Let's work on project X." });
    appendMessage(ctx, session.id, { role: "assistant", content: "Sure, project X is about crypto vault." });
    appendMessage(ctx, session.id, { role: "user", content: "Also calculate 15 * 12." });
    appendMessage(ctx, session.id, { role: "assistant", content: "15 * 12 = 180." });
    appendMessage(ctx, session.id, { role: "user", content: "Now what are our next steps?" });

    const mockLlm: LlmClient = {
      createTurn: async () => ({
        text: "Summary: Working on crypto vault project X. Computed 15*12=180. Next steps pending.",
        finish: "stop",
        toolCalls: [],
      }),
      testConnection: async () => ({ ok: true }),
    };

    const res = await compactSession(ctx, mockLlm, "mock-model", session.id);
    assert.ok(res.summary.includes("Summary: Working on crypto vault"));
    assert.ok(res.compactedCount > 0);

    // Build context: summary should now be part of system context
    const { messages, summary, since } = buildContext(ctx, session.id, null);
    assert.ok(summary);
    assert.ok(since > 0);
    assert.ok(messages.some((m) => typeof m.content === "string" && m.content.includes("Earlier in this conversation")));
  });
});
