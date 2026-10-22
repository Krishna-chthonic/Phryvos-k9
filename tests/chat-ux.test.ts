import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { runMigrations } from "../lib/db/migrate.ts";
import {
  createSession,
  appendMessage,
  regenerate,
  listMessages,
  editUserMessage,
} from "../lib/chat-service.ts";
import {
  groupSessionsByDate,
  exportConversationAsMarkdown,
  exportConversationAsJson,
} from "../lib/chat-utils.ts";
import { verifyImageMagicBytes } from "../lib/validation/chat.ts";
import {
  requestApproval,
  resolveApproval,
  _clearApprovals,
} from "../lib/agent/guardrails.ts";
import type { ChatSessionMeta, ChatMessageDto } from "../lib/chat-client.ts";

describe("Stage 2 Core Chat UX & Verified Polish (CHAT-09 to CHAT-49)", () => {
  let db: Database.Database;
  let tmpDir: string;
  const masterKey = randomBytes(32);

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-chat-ux-test-"));
    const p = path.join(tmpDir, "vault.db");
    db = new Database(p);
    db.pragma("foreign_keys = ON");
    runMigrations(db);
  });

  after(() => {
    try {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(() => {
    _clearApprovals();
  });

  // -------------------------------------------------- CHAT-40: Date Grouping
  describe("CHAT-40: Date Grouping for Session History", () => {
    it("groups sessions correctly into Today, Yesterday, Last 7 Days, and Older", () => {
      const now = new Date("2026-10-22T15:00:00.000Z").getTime();

      const todaySession: ChatSessionMeta = {
        id: "s-today",
        title: "Session Today",
        model: "claude-3-5-sonnet",
        providerId: 1,
        createdAt: now - 2 * 3600_000,
        updatedAt: now - 2 * 3600_000,
      };

      const yesterdaySession: ChatSessionMeta = {
        id: "s-yesterday",
        title: "Session Yesterday",
        model: "claude-3-5-sonnet",
        providerId: 1,
        createdAt: now - 28 * 3600_000,
        updatedAt: now - 28 * 3600_000,
      };

      const lastWeekSession: ChatSessionMeta = {
        id: "s-lastweek",
        title: "Session 4 Days Ago",
        model: "gpt-4o",
        providerId: 2,
        createdAt: now - 4 * 86_400_000,
        updatedAt: now - 4 * 86_400_000,
      };

      const olderSession: ChatSessionMeta = {
        id: "s-older",
        title: "Session 20 Days Ago",
        model: "gpt-4o",
        providerId: 2,
        createdAt: now - 20 * 86_400_000,
        updatedAt: now - 20 * 86_400_000,
      };

      const grouped = groupSessionsByDate(
        [todaySession, yesterdaySession, lastWeekSession, olderSession],
        now,
      );

      assert.equal(grouped.today.length, 1);
      assert.equal(grouped.today[0].id, "s-today");

      assert.equal(grouped.yesterday.length, 1);
      assert.equal(grouped.yesterday[0].id, "s-yesterday");

      assert.equal(grouped.last7Days.length, 1);
      assert.equal(grouped.last7Days[0].id, "s-lastweek");

      assert.equal(grouped.older.length, 1);
      assert.equal(grouped.older[0].id, "s-older");
    });
  });

  // -------------------------------------------------- CHAT-44: Conversation Export
  describe("CHAT-44: Conversation Export to Markdown & JSON", () => {
    const session: ChatSessionMeta = {
      id: "test-session-123",
      title: "Mathematics & Physics Reasoning",
      model: "claude-3-5-sonnet",
      providerId: 1,
      createdAt: 1700000000000,
      updatedAt: 1700001000000,
      summary: "User discussed quantum tunneling and Schrödinger equation.",
    };

    const messages: ChatMessageDto[] = [
      {
        id: "m1",
        seq: 0,
        role: "user",
        content: "What is quantum tunneling?",
        toolCalls: null,
        toolCallId: null,
        editedAt: null,
        createdAt: 1700000010000,
      },
      {
        id: "m2",
        seq: 1,
        role: "assistant",
        content: "Quantum tunneling is a quantum mechanical phenomenon...",
        toolCalls: null,
        toolCallId: null,
        editedAt: null,
        createdAt: 1700000020000,
      },
      {
        id: "m3",
        seq: 2,
        role: "tool",
        content: "Executed search",
        toolCalls: null,
        toolCallId: "call_abc",
        editedAt: null,
        createdAt: 1700000025000,
      },
    ];

    it("exports conversation to clean Markdown ignoring raw internal tool messages", () => {
      const md = exportConversationAsMarkdown(session, messages);
      assert.ok(md.includes("# Mathematics & Physics Reasoning"));
      assert.ok(md.includes("claude-3-5-sonnet"));
      assert.ok(md.includes("👤 User"));
      assert.ok(md.includes("What is quantum tunneling?"));
      assert.ok(md.includes("🤖 Phryvos AI"));
      assert.ok(md.includes("Quantum tunneling is a quantum mechanical phenomenon..."));
      assert.ok(!md.includes("Executed search"), "Raw tool messages should not clutter export");
    });

    it("exports conversation to structured JSON", () => {
      const jsonStr = exportConversationAsJson(session, messages);
      const data = JSON.parse(jsonStr);
      assert.equal(data.schema, "phryvos-chat-export");
      assert.equal(data.session.id, "test-session-123");
      assert.equal(data.session.model, "claude-3-5-sonnet");
      assert.equal(data.messages.length, 3);
      assert.equal(data.messages[0].role, "user");
      assert.equal(data.messages[1].role, "assistant");
    });
  });

  // -------------------------------------------------- Code-Review Verification Tests
  describe("Regenerate Preservation when Last Message is User Turn", () => {
    it("preserves previous turns and does not delete user prompt when regenerate called after truncated edit", () => {
      const ctx = { db, key: masterKey };
      const s = createSession(ctx, { title: "Turn Test", model: "claude-3-5-sonnet", providerId: null });

      // Turn 1
      appendMessage(ctx, s.id, { role: "user", content: "Turn 1 Prompt" });
      const a1 = appendMessage(ctx, s.id, { role: "assistant", content: "Turn 1 Answer" });

      // Turn 2
      const u2 = appendMessage(ctx, s.id, { role: "user", content: "Turn 2 Initial Prompt" });
      appendMessage(ctx, s.id, { role: "assistant", content: "Turn 2 Answer" });

      // User performs Save & Regenerate on Turn 2 (truncate: true)
      editUserMessage(ctx, s.id, u2.id, "Turn 2 Edited Prompt", true);

      // Verify Turn 2 assistant was soft-deleted, but Turn 1 remains active
      let msgs = listMessages(ctx, s.id);
      assert.equal(msgs.length, 3);
      assert.equal(msgs[0].content, "Turn 1 Prompt");
      assert.equal(msgs[1].content, "Turn 1 Answer");
      assert.equal(msgs[2].content, "Turn 2 Edited Prompt");

      // Invoking regenerate(ctx, s.id) must NOT delete Turn 1's assistant or Turn 2's prompt!
      regenerate(ctx, s.id);

      msgs = listMessages(ctx, s.id);
      assert.equal(msgs.length, 3, "All 3 messages must remain active");
      assert.equal(msgs[1].id, a1.id, "Turn 1 assistant answer must not be deleted");
      assert.equal(msgs[2].id, u2.id, "Turn 2 user prompt must not be deleted");
    });
  });

  describe("WEBP vs RIFF Validation", () => {
    it("rejects non-WEBP RIFF containers such as WAV audio", () => {
      // Create a valid RIFF header with "WAVE" format instead of "WEBP"
      const wavHeader = Buffer.from("RIFF\x24\x00\x00\x00WAVEfmt ", "ascii");
      const wavB64 = wavHeader.toString("base64");

      const check = verifyImageMagicBytes(wavB64, "image/webp");
      assert.equal(check.valid, false);
      assert.match(check.error || "", /Unsupported file signature/i);
    });

    it("accepts authentic WebP RIFF headers", () => {
      const webpB64 = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
      const check = verifyImageMagicBytes(webpB64, "image/webp");
      assert.equal(check.valid, true);
      assert.equal(check.detectedMime, "image/webp");
    });
  });

  describe("Approval Idempotent Action Hash Verification", () => {
    it("rejects action hash mismatch even if approval is already resolved", () => {
      const { id, actionHash } = requestApproval({
        tool: "delete_database",
        args: { all: true },
        description: "Wipe database",
      });

      // First resolution with genuine action hash succeeds
      const res1 = resolveApproval(id, "allow", actionHash);
      assert.equal(res1.ok, true);

      // Second resolution with spoofed/mismatched action hash MUST fail
      const badHash = "badhash0000000000000000000000000000000000000000000000000000000000";
      const res2 = resolveApproval(id, "allow", badHash);
      assert.equal(res2.ok, false);
      assert.match(res2.error || "", /Action hash mismatch/i);
    });
  });
});
