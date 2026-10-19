/**
 * Local AI Gateway — auto-discovers Ollama (localhost:11434) and llama.cpp (localhost:8080)
 * Registers as OpenAI-compatible providers with health checks and fallback chain
 */

import { getDb } from "@/lib/db/client";
import { kv } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptBlob } from "@/lib/crypto/envelope";
import { listProviders, createProvider, updateProvider } from "@/lib/providers-service";
import { type VaultCtx, getVaultDb } from "@/lib/dal/vault-dal";

export interface LocalProviderInfo {
  name: string;
  baseUrl: string;
  kind: "ollama" | "llamacpp";
  models: string[];
  healthy: boolean;
  lastCheck: number;
}

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_LLAMACPP_URL = "http://localhost:8080";
const HEALTH_CHECK_TIMEOUT = 5000;
const POLL_INTERVAL = 30_000; // 30 seconds

let pollingInterval: ReturnType<typeof setInterval> | null = null;
let lastKnownProviders: LocalProviderInfo[] = [];

/**
 * Fetch available models from Ollama
 */
async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
  });
  if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status}`);
  const data = await res.json();
  return data.models?.map((m: any) => m.name) ?? [];
}

/**
 * Fetch available models from llama.cpp
 */
async function fetchLlamacppModels(baseUrl: string): Promise<string[]> {
  // llama.cpp uses /models or /v1/models (OpenAI compatible)
  try {
    const res = await fetch(`${baseUrl}/models`, {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json();
      return data.data?.map((m: any) => m.id) ?? data.models?.map((m: any) => m.id) ?? [];
    }
  } catch {
    // ignore, try v1
  }

  try {
    const res = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json();
      return data.data?.map((m: any) => m.id) ?? [];
    }
  } catch {
    // ignore
  }

  return [];
}

/**
 * Health check: send a minimal chat request
 */
async function healthCheck(baseUrl: string, kind: "ollama" | "llamacpp"): Promise<boolean> {
  const testPrompt = "hi";
  const body =
    kind === "ollama"
      ? { model: "test", messages: [{ role: "user", content: testPrompt }], stream: false }
      : { model: "test", messages: [{ role: "user", content: testPrompt }], max_tokens: 1 };

  const endpoints =
    kind === "ollama"
      ? [`${baseUrl}/api/chat`]
      : [`${baseUrl}/v1/chat/completions`, `${baseUrl}/chat/completions`];

  for (const endpoint of endpoints) {
    try {
      const start = Date.now();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT),
      });
      const latency = Date.now() - start;
      if (res.ok && latency < 2000) return true; // healthy if < 2s
    } catch {
      // try next endpoint
    }
  }
  return false;
}

/**
 * Discover and register local providers
 */
export async function discoverLocalProviders(): Promise<LocalProviderInfo[]> {
  const results: LocalProviderInfo[] = [];

  // Check Ollama
  const ollamaUrl = (await getKv("ollama_url")) ?? DEFAULT_OLLAMA_URL;
  try {
    const models = await fetchOllamaModels(ollamaUrl);
    const healthy = await healthCheck(ollamaUrl, "ollama");
    if (models.length > 0) {
      results.push({
        name: "Ollama (local)",
        baseUrl: ollamaUrl,
        kind: "ollama",
        models,
        healthy,
        lastCheck: Date.now(),
      });
    }
  } catch (e) {
    // Ollama not available
  }

  // Check llama.cpp
  const llamacppUrl = (await getKv("llamacpp_url")) ?? DEFAULT_LLAMACPP_URL;
  try {
    const models = await fetchLlamacppModels(llamacppUrl);
    const healthy = await healthCheck(llamacppUrl, "llamacpp");
    if (models.length > 0) {
      results.push({
        name: "llama.cpp (local)",
        baseUrl: llamacppUrl,
        kind: "llamacpp",
        models,
        healthy,
        lastCheck: Date.now(),
      });
    }
  } catch (e) {
    // llama.cpp not available
  }

  lastKnownProviders = results;
  return results;
}

/**
 * Register discovered local providers in the database
 */
export async function registerLocalProviders(ctx: VaultCtx): Promise<number> {
  const providers = await discoverLocalProviders();
  let registered = 0;

  // Get existing providers to check for duplicates
  const existingProviders = listProviders(ctx);

  for (const p of providers) {
    // Check if already registered
    const existing = existingProviders.find((ep) => ep.baseUrl === p.baseUrl);

    if (existing) {
      // Update models list
      updateProvider(ctx, existing.id, { models: p.models });
      continue;
    }

    // Register new provider (no API key needed for local)
    createProvider(ctx, {
      name: p.name,
      kind: "openai", // both Ollama and llama.cpp are OpenAI-compatible
      baseUrl: p.baseUrl,
      models: p.models,
      isDefault: false,
    });
    registered++;
  }

  return registered;
}

/**
 * Get KV value
 */
async function getKv(key: string): Promise<string | null> {
  const db = getDb();
  const row = db.prepare("SELECT value FROM kv WHERE key = ? LIMIT 1").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/**
 * Set KV value
 */
export async function setKv(key: string, value: string): Promise<void> {
  const db = getDb();
  db.prepare(`
    INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
  `).run(key, value, Date.now(), value, Date.now());
}

/**
 * Start background polling for local providers
 */
export function startLocalGatewayPolling(getVaultCtx: () => VaultCtx | null): void {
  if (pollingInterval) return; // already running

  const enabled = async () => {
    const val = await getKv("local_ai_enabled");
    return val !== "false"; // default enabled
  };

  const runPoll = async () => {
    if (!(await enabled())) return;

    try {
      await discoverLocalProviders();
      const ctx = getVaultCtx();
      if (ctx) {
        await registerLocalProviders(ctx);
      }
    } catch (e) {
      console.warn("[LocalGateway] Poll failed:", e);
    }
  };

  // Initial run
  runPoll();

  // Schedule recurring
  pollingInterval = setInterval(runPoll, POLL_INTERVAL);
}

/**
 * Stop background polling
 */
export function stopLocalGatewayPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/**
 * Get last known local providers (for UI)
 */
export function getLastKnownProviders(): LocalProviderInfo[] {
  return lastKnownProviders;
}

/**
 * Configure local gateway URLs
 */
export async function configureLocalGateway(ctx: VaultCtx, config: {
  ollamaUrl?: string;
  llamacppUrl?: string;
  preferLocal?: boolean;
  enabled?: boolean;
}): Promise<void> {
  if (config.ollamaUrl) await setKv("ollama_url", config.ollamaUrl);
  if (config.llamacppUrl) await setKv("llamacpp_url", config.llamacppUrl);
  if (config.preferLocal !== undefined)
    await setKv("prefer_local", config.preferLocal.toString());
  if (config.enabled !== undefined)
    await setKv("local_ai_enabled", config.enabled.toString());

  // Trigger immediate rediscovery
  await discoverLocalProviders();
  await registerLocalProviders(ctx);
}

/**
 * Get fallback chain: remote primary → local secondary → remote tertiary
 */
export async function getFallbackChain(ctx: VaultCtx, primaryProviderId?: number): Promise<number[]> {
  const allProviders = listProviders(ctx);

  const remote = allProviders.filter((p) => !p.baseUrl.includes("localhost"));
  const local = allProviders.filter((p) => p.baseUrl.includes("localhost"));

  const preferLocal = (await getKv("prefer_local")) === "true";

  const chain: number[] = [];

  if (primaryProviderId) {
    const primary = allProviders.find((p) => p.id === primaryProviderId);
    if (primary) chain.push(primary.id);
  } else if (remote.length > 0) {
    chain.push(remote[0].id); // default remote
  }

  if (preferLocal) {
    // Local first, then remote
    for (const p of local) if (!chain.includes(p.id)) chain.push(p.id);
    for (const p of remote) if (!chain.includes(p.id)) chain.push(p.id);
  } else {
    // Remote first, then local
    for (const p of remote) if (!chain.includes(p.id)) chain.push(p.id);
    for (const p of local) if (!chain.includes(p.id)) chain.push(p.id);
  }

  return chain;
}