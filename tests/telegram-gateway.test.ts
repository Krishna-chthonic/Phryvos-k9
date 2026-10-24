/**
 * TDD test for safeSendTelegramMessage — validates:
 * 1. 4000-character chunking
 * 2. Plain-text fallback on Markdown entity parse errors
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { runMigrations } from "../lib/db/migrate.ts";
import { initGatewayDb, listTelegramUsers } from "../lib/gateway/telegram-gateway.ts";
import type { EventCtx } from "../lib/event-service.ts";

let db: Database.Database;
const masterKey = randomBytes(32);
let tmpDir: string;
let vaultCtx: { db: Database.Database; key: Buffer };

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-tg-test-"));
  const p = path.join(tmpDir, "vault.db");
  process.env.VAULT_DB_PATH = p;
  db = new Database(p);
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  initGatewayDb(db);
  vaultCtx = { db, key: masterKey };
});

describe("TelegramGatewayService.safeSendTelegramMessage", () => {
  let gateway: any;
  let callCount: number;
  let callArgs: any[];
  let shouldFailMarkdown: boolean;
  let shouldFailPlain: boolean;

  beforeEach(async () => {
    // Get fresh gateway instance
    const mod = await import("../lib/gateway/telegram-gateway.ts");
    gateway = mod.TelegramGatewayService.getInstance();

    callCount = 0;
    callArgs = [];
    shouldFailMarkdown = false;
    shouldFailPlain = false;

    // Mock callTelegramApi
    (gateway as any).callTelegramApi = async (token: string, method: string, payload: any) => {
      callCount++;
      callArgs.push({ token, method, payload });

      if (payload.parse_mode === "Markdown" && shouldFailMarkdown) {
        throw new Error("Bad Request: can't parse entities: Character '*' is reserved");
      }
      if (payload.parse_mode === undefined && shouldFailPlain) {
        throw new Error("Bad Request: plain text also failed");
      }

      return { ok: true, result: { message_id: callCount } };
    };
  });

  it("sends message under 4000 chars as single chunk with Markdown", async () => {
    const text = "Short message";
    await gateway.safeSendTelegramMessage(db, "test_token:123", "123456", text);

    assert.equal(callCount, 1);
    assert.equal(callArgs[0].method, "sendMessage");
    assert.equal(callArgs[0].payload.chat_id, "123456");
    assert.equal(callArgs[0].payload.text, text);
    assert.equal(callArgs[0].payload.parse_mode, "Markdown");
  });

  it("chunks message over 4000 chars into multiple parts", async () => {
    const longText = "x".repeat(5000);
    await gateway.safeSendTelegramMessage(db, "test_token:123", "123456", longText);

    assert.equal(callCount, 2);
    assert.equal(callArgs[0].payload.text.length, 4000);
    assert.equal(callArgs[1].payload.text.length, 1000);
    assert.equal(callArgs[0].payload.parse_mode, "Markdown");
    assert.equal(callArgs[1].payload.parse_mode, "Markdown");
  });

  it("falls back to plain text when Markdown parse fails", async () => {
    shouldFailMarkdown = true;
    const text = "*bold* text";
    await gateway.safeSendTelegramMessage(db, "test_token:123", "123456", text);

    assert.equal(callCount, 2);
    // First attempt with Markdown
    assert.equal(callArgs[0].payload.parse_mode, "Markdown");
    // Second attempt without parse_mode (plain text)
    assert.equal(callArgs[1].payload.parse_mode, undefined);
    assert.equal(callArgs[1].payload.text, text);
  });

  it("chunks AND falls back to plain text when Markdown fails on long message", async () => {
    shouldFailMarkdown = true;
    const longText = "*".repeat(4500);
    await gateway.safeSendTelegramMessage(db, "test_token:123", "123456", longText);

    // Should have 4 calls: 2 chunks × 2 attempts each
    assert.equal(callCount, 4);
  });

  it("includes buttons in first chunk only", async () => {
    const buttons = [{ text: "OK", data: "ok" }];
    const text = "Short message";
    await gateway.safeSendTelegramMessage(db, "test_token:123", "123456", text, buttons);

    assert.equal(callCount, 1);
    assert.ok(callArgs[0].payload.reply_markup);
  });

  it("includes buttons in first chunk of long message only", async () => {
    const buttons = [{ text: "OK", data: "ok" }];
    const longText = "x".repeat(5000);
    await gateway.safeSendTelegramMessage(db, "test_token:123", "123456", longText, buttons);

    assert.equal(callCount, 2);
    // First chunk has buttons
    assert.ok(callArgs[0].payload.reply_markup);
    // Second chunk does not
    assert.equal(callArgs[1].payload.reply_markup, undefined);
  });
});