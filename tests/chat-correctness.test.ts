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
  getSession,
  updateSession,
  appendMessage,
  editUserMessage,
  listMessages,
} from "../lib/chat-service.ts";
import { createProvider } from "../lib/providers-service.ts";
import {
  requestApproval,
  resolveApproval,
  _clearApprovals,
  computeActionHash,
} from "../lib/agent/guardrails.ts";
import { parseThinking } from "../components/chat/ThinkingAccordion.tsx";
import { parseSseFrame } from "../lib/sse.ts";
import {
  verifyImageMagicBytes,
  estimateBase64Bytes,
  ImagePartSchema,
  ChatMessageContentSchema,
  SendMessageBodySchema,
} from "../lib/validation/chat.ts";
import { getModelContextLimit } from "../components/chat/ChatApp.tsx";

describe("Chat Correctness & Security (CHAT-01 to CHAT-25)", () => {
  let db: Database.Database;
  let tmpDir: string;
  const masterKey = randomBytes(32);

  let p1Id: number;
  let p2Id: number;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-chat-test-"));
    const p = path.join(tmpDir, "vault.db");
    process.env.VAULT_DB_PATH = p;
    db = new Database(p);
    db.pragma("foreign_keys = ON");
    runMigrations(db);

    const ctx = { db, key: masterKey };
    const p1 = createProvider(ctx, {
      name: "Anthropic",
      kind: "anthropic",
      baseUrl: "https://api.anthropic.com",
      models: ["claude-3-5-sonnet"],
    });
    const p2 = createProvider(ctx, {
      name: "OpenAI",
      kind: "openai",
      baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4o"],
    });
    p1Id = p1.id;
    p2Id = p2.id;
  });

  after(() => {
    try {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      delete process.env.VAULT_DB_PATH;
    } catch {}
  });

  beforeEach(() => {
    _clearApprovals();
  });

  // -------------------------------------------------- CHAT-01: Session & Model Sync
  describe("CHAT-01: Model & Provider Persistence", () => {
    it("persists model and providerId updates without reverting on reload", () => {
      const ctx = { db, key: masterKey };
      const s = createSession(ctx, { title: "Test Chat", model: "claude-3-5-sonnet", providerId: p1Id });
      assert.equal(s.model, "claude-3-5-sonnet");
      assert.equal(s.providerId, p1Id);

      // User switches model and provider in header
      const updated = updateSession(ctx, s.id, { model: "gpt-4o", providerId: p2Id, title: "Renamed" });
      assert.equal(updated.model, "gpt-4o");
      assert.equal(updated.providerId, p2Id);
      assert.equal(updated.title, "Renamed");

      // Verify persistence via clean getSession
      const fetched = getSession(ctx, s.id);
      assert.equal(fetched.model, "gpt-4o");
      assert.equal(fetched.providerId, p2Id);
      assert.equal(fetched.title, "Renamed");
    });
  });

  // -------------------------------------------------- CHAT-02: Approvals Resilience
  describe("CHAT-02: Approval Resolution Resilience", () => {
    it("handles idempotent resolution calls gracefully", async () => {
      const { id, actionHash, promise } = requestApproval({
        tool: "delete_file",
        args: { path: "notes/secret.md" },
        description: "Delete secret note",
      });

      // First allow resolution succeeds
      const res1 = resolveApproval(id, "allow", actionHash);
      assert.equal(res1.ok, true);

      // Duplicate allow resolution returns ok: true (idempotent)
      const res2 = resolveApproval(id, "allow", actionHash);
      assert.equal(res2.ok, true);

      const outcome = await promise;
      assert.equal(outcome.decision, "allowed");
    });

    it("rejects approval when action hash mismatches", async () => {
      const { id } = requestApproval({
        tool: "write_file",
        args: { path: "safe.txt", content: "hello" },
        description: "Write safe file",
      });

      const badHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const res = resolveApproval(id, "allow", badHash);
      assert.equal(res.ok, false);
      assert.match(res.error || "", /hash mismatch/i);
    });

    it("returns error for unknown or invalid approval ID", () => {
      const res = resolveApproval("non-existent-id", "deny");
      assert.equal(res.ok, false);
      assert.match(res.error || "", /Unknown/i);
    });
  });

  // -------------------------------------------------- CHAT-03: Thinking Parser
  describe("CHAT-03: Thinking Tag Isolation & Code-Fence Protection", () => {
    it("extracts closed thinking tags and returns clean answer", () => {
      const raw = "<think>Analyzing user query and reviewing knowledge base.</think>The answer is 42.";
      const res = parseThinking(raw);
      assert.equal(res.thinking, "Analyzing user query and reviewing knowledge base.");
      assert.equal(res.answer, "The answer is 42.");
      assert.equal(res.isThinkingLive, false);
    });

    it("protects XML code fences from tag stripping", () => {
      const raw = "Here is an example in XML:\n```xml\n<think>\n  This is not real thinking\n</think>\n```\nHope that helps!";
      const res = parseThinking(raw);
      assert.equal(res.thinking, null);
      assert.ok(res.answer.includes("<think>"));
      assert.ok(res.answer.includes("This is not real thinking"));
      assert.ok(res.answer.includes("```xml"));
      assert.equal(res.isThinkingLive, false);
    });

    it("protects inline backtick code from tag stripping", () => {
      const raw = "To reason, use `<think>` tag followed by `</think>`.";
      const res = parseThinking(raw);
      assert.equal(res.thinking, null);
      assert.ok(res.answer.includes("`<think>`"));
      assert.ok(res.answer.includes("`</think>`"));
    });

    it("handles unclosed streaming thinking tag cleanly", () => {
      const raw = "<think>Currently deliberating the solution step 1...";
      const res = parseThinking(raw);
      assert.equal(res.thinking, "Currently deliberating the solution step 1...");
      assert.equal(res.answer, "");
      assert.equal(res.isThinkingLive, true);
    });

    it("aggregates multiple thinking blocks", () => {
      const raw = "<think>First thought</think>Middle text.<think>Second thought</think>Final answer.";
      const res = parseThinking(raw);
      assert.ok(res.thinking?.includes("First thought"));
      assert.ok(res.thinking?.includes("Second thought"));
      assert.ok(res.thinking?.includes("---"));
      assert.equal(res.answer, "Middle text.Final answer.");
    });
  });

  // -------------------------------------------------- CHAT-04 & CHAT-10: SSE Stream Parsing
  describe("CHAT-04 & CHAT-10: SSE Frame Parsing", () => {
    it("parses standard event and data frames with LF delimiters", () => {
      const frame = "event: delta\ndata: {\"text\":\"Hello world\"}";
      const ev = parseSseFrame(frame);
      assert.ok(ev);
      assert.equal(ev.event, "delta");
      assert.equal(ev.data, "{\"text\":\"Hello world\"}");
    });

    it("parses CRLF delimiters identically to LF", () => {
      const frame = "event: step\r\ndata: {\"step\":1,\"tool\":\"calculate\"}";
      const ev = parseSseFrame(frame);
      assert.ok(ev);
      assert.equal(ev.event, "step");
      assert.equal(ev.data, "{\"step\":1,\"tool\":\"calculate\"}");
    });

    it("parses multi-line data payloads", () => {
      const frame = "event: message\ndata: line 1\ndata: line 2";
      const ev = parseSseFrame(frame);
      assert.ok(ev);
      assert.equal(ev.event, "message");
      assert.equal(ev.data, "line 1\nline 2");
    });

    it("returns null on empty or comment-only frames", () => {
      assert.equal(parseSseFrame(""), null);
      assert.equal(parseSseFrame(": ping keepalive"), null);
    });
  });

  // -------------------------------------------------- CHAT-05 & CHAT-06: Message Editing
  describe("CHAT-05 & CHAT-06: Message Editing (Non-destructive vs Truncate)", () => {
    it("non-destructive edit (truncate: false) updates content without deleting subsequent messages", () => {
      const ctx = { db, key: masterKey };
      const s = createSession(ctx, { title: "Edit Test", model: "claude-3-5-sonnet", providerId: null });

      const u1 = appendMessage(ctx, s.id, { role: "user", content: "Original typo message" });
      const a1 = appendMessage(ctx, s.id, { role: "assistant", content: "Reply to typo" });
      const u2 = appendMessage(ctx, s.id, { role: "user", content: "Follow-up question" });

      assert.equal(listMessages(ctx, s.id).length, 3);

      // Non-destructive edit (typo fix in place)
      editUserMessage(ctx, s.id, u1.id, "Corrected user message", false);

      const msgs = listMessages(ctx, s.id);
      assert.equal(msgs.length, 3, "All messages preserved");
      assert.equal(msgs[0].content, "Corrected user message");
      assert.equal(msgs[1].id, a1.id);
      assert.equal(msgs[2].id, u2.id);
    });

    it("destructive edit (truncate: true) resets summary and deletes subsequent turns for regeneration", () => {
      const ctx = { db, key: masterKey };
      const s = createSession(ctx, { title: "Regenerate Test", model: "claude-3-5-sonnet", providerId: null });

      const u1 = appendMessage(ctx, s.id, { role: "user", content: "First prompt" });
      appendMessage(ctx, s.id, { role: "assistant", content: "First reply" });
      appendMessage(ctx, s.id, { role: "user", content: "Second prompt" });

      assert.equal(listMessages(ctx, s.id).length, 3);

      // Destructive edit with truncate: true
      editUserMessage(ctx, s.id, u1.id, "Branch reset prompt", true);

      const msgs = listMessages(ctx, s.id);
      assert.equal(msgs.length, 1, "Subsequent turns truncated");
      assert.equal(msgs[0].content, "Branch reset prompt");
    });
  });

  // -------------------------------------------------- CHAT-16: Attachments Security & Sniffing
  describe("CHAT-16: Attachment Validation & Magic Byte Sniffing", () => {
    // Valid PNG signature base64 prefix
    const validPngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    // Valid JPEG signature base64 prefix
    const validJpegB64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
    // Valid WebP signature base64 prefix
    const validWebpB64 = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
    // Valid GIF signature base64 prefix
    const validGifB64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    it("verifies genuine image signatures correctly", () => {
      assert.equal(verifyImageMagicBytes(validPngB64, "image/png").valid, true);
      assert.equal(verifyImageMagicBytes(validJpegB64, "image/jpeg").valid, true);
      assert.equal(verifyImageMagicBytes(validWebpB64, "image/webp").valid, true);
      assert.equal(verifyImageMagicBytes(validGifB64, "image/gif").valid, true);
    });

    it("detects and rejects spoofed MIME types", () => {
      // Declared as JPEG but payload is PNG
      const check = verifyImageMagicBytes(validPngB64, "image/jpeg");
      assert.equal(check.valid, false);
      assert.match(check.error || "", /mismatch/i);
    });

    it("rejects non-image payloads (e.g. text or script disguised as base64)", () => {
      const textB64 = Buffer.from("console.log('malicious script')").toString("base64");
      const check = verifyImageMagicBytes(textB64);
      assert.equal(check.valid, false);
      assert.match(check.error || "", /Unsupported file signature/i);
    });

    it("estimates base64 binary size accurately with padding", () => {
      const b1 = "AA=="; // 1 byte
      const b2 = "AAA="; // 2 bytes
      const b3 = "AAAA"; // 3 bytes
      assert.equal(estimateBase64Bytes(b1), 1);
      assert.equal(estimateBase64Bytes(b2), 2);
      assert.equal(estimateBase64Bytes(b3), 3);
    });

    it("rejects attachments exceeding count limit (> 4 images)", () => {
      const images = Array(5).fill({
        type: "image",
        dataBase64: validPngB64,
        mediaType: "image/png",
      });
      const parsed = ChatMessageContentSchema.safeParse(images);
      assert.equal(parsed.success, false);
      assert.match(parsed.error?.issues[0]?.message || "", /maximum is 4/i);
    });

    it("accepts valid SendMessageBodySchema payloads", () => {
      const body = {
        content: "Hello AI",
        model: "claude-3-5-sonnet",
        effort: "high",
        mode: "thinking",
      };
      const parsed = SendMessageBodySchema.safeParse(body);
      assert.equal(parsed.success, true);
    });
  });

  // -------------------------------------------------- CHAT-25: Dynamic Context Limits
  describe("CHAT-25: Context Window Limits by Model", () => {
    it("returns appropriate context window limits for various AI models", () => {
      assert.equal(getModelContextLimit("claude-3-5-sonnet-20241022"), 200_000);
      assert.equal(getModelContextLimit("claude-opus-4"), 200_000);
      assert.equal(getModelContextLimit("gemini-1.5-pro"), 1_000_000);
      assert.equal(getModelContextLimit("gpt-4o"), 128_000);
      assert.equal(getModelContextLimit("o1-preview"), 128_000);
      assert.equal(getModelContextLimit("llama-3-8b"), 8_192);
      assert.equal(getModelContextLimit("llama-3.1-70b"), 128_000);
      assert.equal(getModelContextLimit("unknown-custom-model"), 128_000);
    });
  });
});
