import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { encryptBlob, gcmDecrypt } from "@/lib/crypto/envelope";
import { createAnthropicClient } from "@/lib/ai/adapters/anthropic";
import {
  createOpenAiCompatibleClient,
  type ProviderConnection,
} from "@/lib/ai/adapters/openai-compatible";
import { wrapLlmClientWithScrubber } from "@/lib/ai/pii-scrubber";
import type { LlmClient } from "@/lib/ai/types";
import {
  ensureFreeProviderConfigured,
  createFreeFrontierClient,
} from "@/lib/ai/free-frontier-service";

export interface VaultCtx {
  db: Database.Database;
  key: Buffer;
}

export interface ProviderMeta {
  id: number;
  name: string;
  kind: "openai" | "anthropic";
  baseUrl: string;
  models: string[];
  isDefault: boolean;
  hasKey: boolean;
  createdAt: number;
}

interface ProviderRow {
  id: number;
  name: string;
  kind: "openai" | "anthropic";
  base_url: string;
  api_key: Buffer | null;
  key_nonce: Buffer | null;
  key_tag: Buffer | null;
  models: string | null;
  is_default: number;
  created_at: number;
}

function parseModels(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function toMeta(r: ProviderRow): ProviderMeta {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    baseUrl: r.base_url,
    models: parseModels(r.models),
    isDefault: !!r.is_default,
    hasKey: !!r.api_key,
    createdAt: r.created_at,
  };
}

function row(ctx: VaultCtx, id: number): ProviderRow | undefined {
  return ctx.db.prepare("SELECT * FROM ai_providers WHERE id = ?").get(id) as
    | ProviderRow
    | undefined;
}

export function listProviders(ctx: VaultCtx): ProviderMeta[] {
  const rows = ctx.db
    .prepare("SELECT * FROM ai_providers ORDER BY is_default DESC, name")
    .all() as ProviderRow[];
  return rows.map(toMeta);
}

export function getProviderMeta(ctx: VaultCtx, id: number): ProviderMeta {
  const r = row(ctx, id);
  if (!r) throw new Error(`Provider not found: ${id}`);
  return toMeta(r);
}

export interface ProviderInput {
  name: string;
  kind: "openai" | "anthropic";
  baseUrl: string;
  /** optional; omit to keep the stored key */
  apiKey?: string;
  models?: string[];
  isDefault?: boolean;
}

export function createProvider(ctx: VaultCtx, input: ProviderInput): ProviderMeta {
  const now = Date.now();
  let meta: ProviderMeta;
  const tx = ctx.db.transaction(() => {
    const keyBlob = input.apiKey ? encryptBlob(ctx.key, input.apiKey) : null;
    const res = ctx.db
      .prepare(
        `INSERT INTO ai_providers (name, kind, base_url, api_key, key_nonce, key_tag, models, is_default, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name.trim(),
        input.kind,
        input.baseUrl.trim(),
        keyBlob?.enc ?? null,
        keyBlob?.nonce ?? null,
        keyBlob?.tag ?? null,
        JSON.stringify(input.models ?? []),
        input.isDefault ? 1 : 0,
        now,
      );
    if (input.isDefault)
      ctx.db.prepare("UPDATE ai_providers SET is_default = 0 WHERE id != ?").run(
        res.lastInsertRowid,
      );
    meta = toMeta(row(ctx, Number(res.lastInsertRowid))!);
  });
  tx();
  return meta!;
}

export function updateProvider(
  ctx: VaultCtx,
  id: number,
  input: Partial<ProviderInput>,
): ProviderMeta {
  const r = row(ctx, id);
  if (!r) throw new Error(`Provider not found: ${id}`);
  let meta: ProviderMeta;
  const set: string[] = [];
  const args: Array<string | number | null | Buffer> = [];
  if (input.name !== undefined) {
    set.push("name = ?");
    args.push(input.name.trim());
  }
  if (input.kind !== undefined) {
    set.push("kind = ?");
    args.push(input.kind);
  }
  if (input.baseUrl !== undefined) {
    set.push("base_url = ?");
    args.push(input.baseUrl.trim());
  }
  if (input.apiKey !== undefined && input.apiKey !== "") {
    const keyBlob = encryptBlob(ctx.key, input.apiKey);
    set.push("api_key = ?, key_nonce = ?, key_tag = ?");
    args.push(keyBlob.enc, keyBlob.nonce, keyBlob.tag);
  }
  if (input.models !== undefined) {
    set.push("models = ?");
    args.push(JSON.stringify(input.models));
  }
  if (input.isDefault !== undefined) {
    set.push("is_default = ?");
    args.push(input.isDefault ? 1 : 0);
  }
  const tx = ctx.db.transaction(() => {
    if (input.isDefault)
      ctx.db.prepare("UPDATE ai_providers SET is_default = 0 WHERE id != ?").run(id);
    if (set.length) {
      args.push(id);
      ctx.db
        .prepare(`UPDATE ai_providers SET ${set.join(", ")} WHERE id = ?`)
        .run(...args);
    }
    meta = toMeta(row(ctx, id)!);
  });
  tx();
  return meta!;
}

export function deleteProvider(ctx: VaultCtx, id: number): void {
  const r = row(ctx, id);
  if (!r) throw new Error(`Provider not found: ${id}`);
  const tx = ctx.db.transaction(() => {
    // sessions may still reference the provider — detach, don't lose chats
    ctx.db
      .prepare("UPDATE chat_sessions SET provider_id = NULL WHERE provider_id = ?")
      .run(id);
    ctx.db.prepare("DELETE FROM ai_providers WHERE id = ?").run(id);
  });
  tx();
}

export function defaultProvider(ctx: VaultCtx): ProviderMeta | null {
  let r = ctx.db
    .prepare("SELECT * FROM ai_providers ORDER BY is_default DESC, created_at LIMIT 1")
    .get() as ProviderRow | undefined;
  if (!r) {
    try {
      ensureFreeProviderConfigured(ctx);
      r = ctx.db
        .prepare("SELECT * FROM ai_providers ORDER BY is_default DESC, created_at LIMIT 1")
        .get() as ProviderRow | undefined;
    } catch {}
  }
  return r ? toMeta(r) : null;
}

/** Decrypted connection for the adapters. The key never leaves this module. */
export function connectionFor(ctx: VaultCtx, id: number): ProviderConnection {
  const r = row(ctx, id);
  if (!r) throw new Error(`Provider not found: ${id}`);
  let apiKey = "";
  if (r.api_key && r.key_nonce && r.key_tag) {
    apiKey = gcmDecrypt(ctx.key, {
      enc: r.api_key,
      nonce: r.key_nonce,
      tag: r.key_tag,
    }).toString("utf8");
  }
  return {
    kind: r.kind,
    baseUrl: r.base_url,
    apiKey,
    models: parseModels(r.models),
  };
}

export function createLlmClient(ctx: VaultCtx, providerId: number, options?: { skipScrubber?: boolean }): LlmClient {
  const meta = getProviderMeta(ctx, providerId);
  let raw: LlmClient;
  if (meta.name.includes("Free Frontier") || meta.baseUrl.includes("pollinations")) {
    raw = createFreeFrontierClient();
  } else {
    const conn = connectionFor(ctx, providerId);
    raw = conn.kind === "anthropic"
      ? createAnthropicClient(conn)
      : createOpenAiCompatibleClient(conn);
  }
  return options?.skipScrubber ? raw : wrapLlmClientWithScrubber(raw);
}

export { randomUUID as newChatId };
