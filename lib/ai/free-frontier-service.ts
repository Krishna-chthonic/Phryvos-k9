/**
 * Free Frontier AI Models Engine for Phryvos-K9
 * Inspired by Ebony-Vinyl/dsh-our-free-model (DeepSeek Harness Free Models Plugin)
 * 
 * Provides:
 * 1. Zero configuration, zero sign-up, zero API key access to frontier models:
 *    - DeepSeek V4.1 Flash / V3
 *    - DeepSeek R1 Reasoning
 *    - Moonshot Kimi K3
 *    - Qwen 2.5 Coder 32B
 *    - Mistral NeMo 12B
 * 2. Multi-lane Upstream Public Gateways with Live Ping & Latency Tracking
 * 3. Intelligent Auto-Fallback Cascading (429 / 503 / timeout resilience)
 * 4. Local OpenAI-compatible Forwarding Proxy (/api/ai/free/v1/chat/completions)
 * 5. Native LlmClient adapter for Dots, Chat, and Agent tool execution
 */

import { encryptBlob, gcmDecrypt } from "@/lib/crypto/envelope";
import type { LlmClient, UnifiedMessage, ToolSpec, TurnResult, DeltaFn, TurnOptions } from "./types";
import { createOpenAiCompatibleClient } from "./adapters/openai-compatible";
import type { VaultCtx } from "@/lib/providers-service";

export interface FreeModelSpec {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  description: string;
  recommendedRole: string;
  capabilities: string[];
}

export const FREE_FRONTIER_MODELS: FreeModelSpec[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek V4.1 Flash / V3",
    provider: "DeepSeek AI",
    contextWindow: 65536,
    description: "State-of-the-art general intelligence, agentic tool-calling, and lightning-fast code synthesis.",
    recommendedRole: "Primary Coworker, Dot Brain, General Assistant",
    capabilities: ["tools", "reasoning", "multilingual", "streaming"],
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek R1 Reasoning",
    provider: "DeepSeek AI",
    contextWindow: 65536,
    description: "Deep thinking CoT chain-of-thought model specialized in advanced mathematics, algorithms, and deep physics.",
    recommendedRole: "Math & Physics Solver, Strategic Architecture",
    capabilities: ["thinking", "math", "logic", "code"],
  },
  {
    id: "qwen-coder",
    name: "Qwen 2.5 Coder 32B",
    provider: "Alibaba Qwen",
    contextWindow: 32768,
    description: "Surgical software engineering specialist trained extensively on multi-file repo edits, git workflows, and debugging.",
    recommendedRole: "Lead Programmer Dot, Code Reviewer",
    capabilities: ["tools", "code", "refactoring", "git"],
  },
  {
    id: "kimi-k3",
    name: "Moonshot Kimi K3",
    provider: "Moonshot AI",
    contextWindow: 131072,
    description: "Ultra-long context frontier model with high-fidelity document comprehension and summarization.",
    recommendedRole: "Vault Archivist, Deep Document Analyzer",
    capabilities: ["long-context", "documents", "synthesis"],
  },
  {
    id: "mistral-nemo",
    name: "Mistral NeMo 12B",
    provider: "Mistral AI",
    contextWindow: 32768,
    description: "Compact high-efficiency multilingual foundation model for low-latency interactive tasks.",
    recommendedRole: "Quick Task Runner, Mobile Companion",
    capabilities: ["low-latency", "multilingual"],
  },
];

export interface UpstreamGateway {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  priority: number;
}

export const UPSTREAM_PUBLIC_GATEWAYS: UpstreamGateway[] = [
  {
    id: "pollinations",
    name: "Pollinations Public Gateway",
    baseUrl: "https://text.pollinations.ai/openai",
    apiKey: "free-tier",
    priority: 1,
  },
  {
    id: "airforce",
    name: "Airforce Community Router",
    baseUrl: "https://api.airforce/v1",
    apiKey: "free-tier",
    priority: 2,
  },
  {
    id: "huggingface-router",
    name: "HuggingFace Serverless Router",
    baseUrl: "https://router.huggingface.co/novita/v1",
    apiKey: "hf_free_community",
    priority: 3,
  },
];

export interface GatewayHealthStatus {
  id: string;
  name: string;
  baseUrl: string;
  status: "online" | "degraded" | "offline";
  latencyMs: number;
  lastChecked: number;
}

// In-memory latency cache
const healthCache = new Map<string, GatewayHealthStatus>();

/**
 * Pings an upstream gateway and returns latency and health status
 */
export async function checkGatewayLatency(gateway: UpstreamGateway): Promise<GatewayHealthStatus> {
  const start = Date.now();
  let status: GatewayHealthStatus["status"] = "offline";
  let latencyMs = 9999;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${gateway.baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${gateway.apiKey}`,
        "User-Agent": "Phryvos-K9/1.0 (dsh-our-free-model)",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    latencyMs = Date.now() - start;
    if (res.ok || res.status === 404 || res.status === 401) {
      // 404 on /models is fine as long as server responds quickly
      status = latencyMs < 2500 ? "online" : "degraded";
    } else {
      status = "degraded";
    }
  } catch (err) {
    latencyMs = Date.now() - start;
    status = "offline";
  }

  const result: GatewayHealthStatus = {
    id: gateway.id,
    name: gateway.name,
    baseUrl: gateway.baseUrl,
    status,
    latencyMs,
    lastChecked: Date.now(),
  };

  healthCache.set(gateway.id, result);
  return result;
}

/**
 * Checks all upstream public gateways and returns their status
 */
export async function getAllGatewaysHealth(): Promise<GatewayHealthStatus[]> {
  const results = await Promise.all(
    UPSTREAM_PUBLIC_GATEWAYS.map((gw) => {
      const cached = healthCache.get(gw.id);
      if (cached && Date.now() - cached.lastChecked < 60_000) {
        return Promise.resolve(cached);
      }
      return checkGatewayLatency(gw);
    }),
  );
  return results;
}

/**
 * Native LlmClient implementing intelligent multi-gateway fallback cascading
 */
export function createFreeFrontierClient(): LlmClient {
  return {
    async createTurn(
      messages: UnifiedMessage[],
      tools?: ToolSpec[],
      model = "deepseek-chat",
      onDelta?: DeltaFn,
      options?: TurnOptions,
    ): Promise<TurnResult> {
      let lastError: Error | null = null;

      // Sort gateways by cached latency / priority
      const sortedGateways = [...UPSTREAM_PUBLIC_GATEWAYS].sort((a, b) => {
        const hA = healthCache.get(a.id);
        const hB = healthCache.get(b.id);
        const latA = hA?.status === "online" ? hA.latencyMs : 10000 + a.priority * 100;
        const latB = hB?.status === "online" ? hB.latencyMs : 10000 + b.priority * 100;
        return latA - latB;
      });

      for (const gateway of sortedGateways) {
        try {
          const client = createOpenAiCompatibleClient({
            kind: "openai",
            baseUrl: gateway.baseUrl,
            apiKey: gateway.apiKey,
            models: FREE_FRONTIER_MODELS.map((m) => m.id),
          });

          const result = await client.createTurn(messages, tools, model, onDelta, {
            ...options,
            timeoutMs: options?.timeoutMs || 45_000,
          });

          // If turn produced text or tool calls, success!
          if (result.text || (result.toolCalls && result.toolCalls.length > 0)) {
            return result;
          }
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.warn(`[FreeFrontier] Upstream gateway ${gateway.name} failed: ${lastError.message}. Cascading to next fallback...`);
          // Mark degraded in cache
          healthCache.set(gateway.id, {
            id: gateway.id,
            name: gateway.name,
            baseUrl: gateway.baseUrl,
            status: "degraded",
            latencyMs: 9999,
            lastChecked: Date.now(),
          });
        }
      }

      throw new Error(`All free frontier upstream gateways failed. Last error: ${lastError?.message || "Unknown error"}`);
    },

    async testConnection(model = "deepseek-chat"): Promise<{ ok: boolean; detail?: string }> {
      try {
        const turn = await this.createTurn(
          [{ role: "user", content: "Reply with the word 'OK'." }],
          undefined,
          model,
        );
        return { ok: turn.text.toLowerCase().includes("ok") || turn.text.length > 0, detail: turn.text.slice(0, 100) };
      } catch (err) {
        return { ok: false, detail: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

const FREE_PROVIDER_NAME = "Phryvos Free Frontier (Zero-Config)";

/**
 * Ensures the Free Frontier provider is registered in the user's encrypted vault
 */
export function ensureFreeProviderConfigured(ctx: VaultCtx): { id: number; isDefault: boolean } {
  const existing = ctx.db
    .prepare("SELECT id, is_default FROM ai_providers WHERE name = ?")
    .get(FREE_PROVIDER_NAME) as { id: number; is_default: number } | undefined;

  const modelList = FREE_FRONTIER_MODELS.map((m) => m.id);

  if (existing) {
    // Ensure models list is up to date
    ctx.db
      .prepare("UPDATE ai_providers SET models = ?, base_url = ? WHERE id = ?")
      .run(JSON.stringify(modelList), "https://text.pollinations.ai/openai", existing.id);
    return { id: existing.id, isDefault: !!existing.is_default };
  }

  // Check if any default provider exists
  const hasDefault = ctx.db.prepare("SELECT id FROM ai_providers WHERE is_default = 1").get();
  const shouldBeDefault = !hasDefault;

  const keyBlob = encryptBlob(ctx.key, "free-tier");
  const now = Date.now();

  const res = ctx.db
    .prepare(
      `INSERT INTO ai_providers (name, kind, base_url, api_key, key_nonce, key_tag, models, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      FREE_PROVIDER_NAME,
      "openai",
      "https://text.pollinations.ai/openai",
      keyBlob.enc,
      keyBlob.nonce,
      keyBlob.tag,
      JSON.stringify(modelList),
      shouldBeDefault ? 1 : 0,
      now,
    );

  return { id: Number(res.lastInsertRowid), isDefault: shouldBeDefault };
}

/**
 * Sets the Free Frontier provider as the active default in the database
 */
export function setFreeProviderAsDefault(ctx: VaultCtx): void {
  const info = ensureFreeProviderConfigured(ctx);
  ctx.db.transaction(() => {
    ctx.db.prepare("UPDATE ai_providers SET is_default = 0").run();
    ctx.db.prepare("UPDATE ai_providers SET is_default = 1 WHERE id = ?").run(info.id);
  })();
}
