import { describe, it, before, after } from "node:test";
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
  listMessages,
  forkSession,
  setMessageFeedback,
  setMessageTelemetry,
} from "../lib/chat-service.ts";
import {
  findConversationMatches,
  getDraftStorageKey,
} from "../lib/chat-utils.ts";
import { areMessageRowPropsEqual } from "../components/chat/MessageRow.tsx";
import type { TurnTelemetry } from "../lib/ai/types.ts";
import type { ChatMessageDto } from "../lib/chat-service.ts";

describe("Stage 4: Differentiation, Observability & Polish (CHAT-50 to CHAT-56)", () => {
  let db: Database.Database;
  let tmpDir: string;
  const masterKey = randomBytes(32);

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-chat-diff-test-"));
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

  // -------------------------------------------------- Feature A: Conversation Branching
  describe("Feature A: Conversation Branching (Zero Re-encryption Forking)", () => {
    it("forks session up to cutoff message, preserving prior turns with normalized seq", () => {
      const ctx = { db, key: masterKey };
      const src = createSession(ctx, {
        title: "Original Topic Discussion",
        model: "claude-sonnet-5-5",
        providerId: null,
        mode: "agent",
        effort: "high",
      });

      const m1 = appendMessage(ctx, src.id, { role: "user", content: "Step 1: Introduction" });
      const m2 = appendMessage(ctx, src.id, { role: "assistant", content: "Step 2: Foundation analysis" });
      const m3 = appendMessage(ctx, src.id, { role: "user", content: "Step 3: Alternative idea" });
      const m4 = appendMessage(ctx, src.id, { role: "assistant", content: "Step 4: Alternative conclusion" });

      // Fork from m2
      const forked = forkSession(ctx, src.id, m2.id);

      assert.ok(forked.session.id !== src.id, "Fork must receive a new session ID");
      assert.equal(forked.session.title, "Fork of Original Topic Discussion");
      assert.equal(forked.session.model, "claude-sonnet-5-5");
      assert.equal(forked.session.mode, "agent");
      assert.equal(forked.session.effort, "high");

      const forkedMsgs = listMessages(ctx, forked.session.id);
      assert.equal(forkedMsgs.length, 2, "Forked session should only contain turns up to cutoff");
      assert.equal(forkedMsgs[0].seq, 0);
      assert.equal(forkedMsgs[0].content, "Step 1: Introduction");
      assert.equal(forkedMsgs[1].seq, 1);
      assert.equal(forkedMsgs[1].content, "Step 2: Foundation analysis");
      assert.notEqual(forkedMsgs[0].id, m1.id, "Cloned messages must have distinct IDs");
      assert.notEqual(forkedMsgs[1].id, m2.id, "Cloned messages must have distinct IDs");

      // Verify original session is completely untouched
      const origMsgs = listMessages(ctx, src.id);
      assert.equal(origMsgs.length, 4);

      // Verify appending to source session does not pollute forked session
      appendMessage(ctx, src.id, { role: "user", content: "Step 5: Post-fork message" });
      const forkedMsgsAfter = listMessages(ctx, forked.session.id);
      assert.equal(forkedMsgsAfter.length, 2);
    });

    it("supports custom title and handles invalid cutoff message gracefully", () => {
      const ctx = { db, key: masterKey };
      const src = createSession(ctx, {
        title: "Seed",
        model: "gpt-4o",
        providerId: null,
      });
      const m1 = appendMessage(ctx, src.id, { role: "user", content: "Hello" });

      const forked = forkSession(ctx, src.id, m1.id, "Custom Explored Branch");
      assert.equal(forked.session.title, "Custom Explored Branch");

      assert.throws(() => {
        forkSession(ctx, src.id, "non-existent-msg-id");
      }, /Cutoff message not found/);

      assert.throws(() => {
        forkSession(ctx, "non-existent-session-id", m1.id);
      }, /Source session not found/);
    });
  });

  // -------------------------------------------------- Feature D: Turn-Level Feedback
  describe("Feature D: Turn-Level Feedback", () => {
    it("persists helpful and unhelpful ratings and allows toggling to null", () => {
      const ctx = { db, key: masterKey };
      const s = createSession(ctx, { title: "Feedback Test", model: "auto", providerId: null });
      appendMessage(ctx, s.id, { role: "user", content: "Explain quantum decoherence" });
      const a1 = appendMessage(ctx, s.id, { role: "assistant", content: "Quantum decoherence is..." });

      setMessageFeedback(ctx, s.id, a1.id, "helpful");
      let msgs = listMessages(ctx, s.id);
      assert.equal(msgs[1].feedback, "helpful");

      setMessageFeedback(ctx, s.id, a1.id, "unhelpful");
      msgs = listMessages(ctx, s.id);
      assert.equal(msgs[1].feedback, "unhelpful");

      setMessageFeedback(ctx, s.id, a1.id, null);
      msgs = listMessages(ctx, s.id);
      assert.equal(msgs[1].feedback, null);
    });
  });

  // -------------------------------------------------- CHAT-55: Turn Route Telemetry
  describe("CHAT-55 & Feature F: Turn Route Telemetry", () => {
    it("persists and reads turn telemetry data on assistant messages", () => {
      const ctx = { db, key: masterKey };
      const s = createSession(ctx, { title: "Telemetry Test", model: "auto", providerId: null });
      appendMessage(ctx, s.id, { role: "user", content: "Run calculation" });
      const a1 = appendMessage(ctx, s.id, { role: "assistant", content: "Calculated answer is 42." });

      const telemetry: TurnTelemetry = {
        latencyMs: 384,
        promptTokens: 120,
        completionTokens: 35,
        totalTokens: 155,
        model: "gpt-4o",
        provider: "openai",
        finishReason: "stop",
      };

      setMessageTelemetry(ctx, s.id, a1.id, telemetry);
      const msgs = listMessages(ctx, s.id);
      assert.deepEqual(msgs[1].telemetry, telemetry);
    });
  });

  // -------------------------------------------------- Feature B: In-Conversation Search
  describe("Feature B: In-Conversation Search", () => {
    it("finds case-insensitive occurrences across messages with character offsets", () => {
      const messages: ChatMessageDto[] = [
        {
          id: "m-1",
          seq: 0,
          role: "user",
          content: "Can you help optimize this algorithm for performance?",
          toolCalls: null,
          toolCallId: null,
          editedAt: null,
          createdAt: 1000,
        },
        {
          id: "m-2",
          seq: 1,
          role: "assistant",
          content: "Sure! High performance algorithms require optimizing cache locality and algorithmic complexity.",
          toolCalls: null,
          toolCallId: null,
          editedAt: null,
          createdAt: 2000,
        },
      ];

      const matches = findConversationMatches(messages, "performance");
      assert.equal(matches.length, 2);

      // Match 1: in m-1
      assert.equal(matches[0].messageId, "m-1");
      assert.equal(matches[0].startIndex, 41);
      assert.equal(matches[0].endIndex, 52);
      assert.equal(matches[0].globalIndex, 0);

      // Match 2: in m-2
      assert.equal(matches[1].messageId, "m-2");
      assert.equal(matches[1].startIndex, 11);
      assert.equal(matches[1].endIndex, 22);
      assert.equal(matches[1].globalIndex, 1);
    });

    it("returns empty array for empty query or no matches", () => {
      const messages: ChatMessageDto[] = [
        {
          id: "m-1",
          seq: 0,
          role: "user",
          content: "Hello world",
          toolCalls: null,
          toolCallId: null,
          editedAt: null,
          createdAt: 1000,
        },
      ];

      assert.deepEqual(findConversationMatches(messages, ""), []);
      assert.deepEqual(findConversationMatches(messages, "  "), []);
      assert.deepEqual(findConversationMatches(messages, "cryptography"), []);
    });
  });

  // -------------------------------------------------- Feature C: Composer Draft Recovery
  describe("Feature C: Composer Draft Recovery", () => {
    it("generates session-scoped storage key protecting draft state across sessions", () => {
      const key1 = getDraftStorageKey("session-abc");
      const key2 = getDraftStorageKey("session-xyz");
      assert.equal(key1, "phryvos_draft_session-abc");
      assert.equal(key2, "phryvos_draft_session-xyz");
      assert.notEqual(key1, key2);
    });
  });

  // -------------------------------------------------- CHAT-52: MessageRow Memoization Comparator
  describe("CHAT-52: MessageRow Memoization Comparator", () => {
    it("returns true for identical historical messages even if callbacks/parent re-render", () => {
      const msg: ChatMessageDto = {
        id: "msg-101",
        seq: 3,
        role: "assistant",
        content: "Static response",
        toolCalls: null,
        toolCallId: null,
        editedAt: null,
        feedback: "helpful",
        telemetry: {
          latencyMs: 500,
          model: "gpt-4o",
          provider: "openai",
          finishReason: "stop",
        },
        createdAt: 5000,
      };

      const prevProps = {
        msg,
        streaming: false,
        onEdit: () => {},
        onFork: () => {},
        onFeedback: () => {},
      };

      const nextProps = {
        msg: { ...msg },
        streaming: false,
        onEdit: () => {}, // New function reference from parent re-render
        onFork: () => {},
        onFeedback: () => {},
      };

      assert.equal(
        areMessageRowPropsEqual(prevProps, nextProps),
        true,
        "Completed historical turn should not re-render on parent render with fresh callbacks",
      );
    });

    it("returns false when message content, feedback, streaming flag, or search query changes", () => {
      const baseMsg: ChatMessageDto = {
        id: "msg-102",
        seq: 4,
        role: "assistant",
        content: "Initial text",
        toolCalls: null,
        toolCallId: null,
        editedAt: null,
        createdAt: 6000,
      };

      const p1 = { msg: baseMsg, streaming: false, onEdit: () => {} };

      // Changed streaming
      assert.equal(areMessageRowPropsEqual(p1, { ...p1, streaming: true }), false);

      // Changed content
      assert.equal(
        areMessageRowPropsEqual(p1, {
          ...p1,
          msg: { ...baseMsg, content: "Updated text" },
        }),
        false,
      );

      // Changed feedback
      assert.equal(
        areMessageRowPropsEqual(p1, {
          ...p1,
          msg: { ...baseMsg, feedback: "helpful" },
        }),
        false,
      );

      // Changed search query
      assert.equal(
        areMessageRowPropsEqual(p1, {
          ...p1,
          searchQuery: "search-term",
        }),
        false,
      );
    });
  });
});
