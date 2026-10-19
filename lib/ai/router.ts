/**
 * Dynamic Semantic Router — intent-based model dispatch
 * Fast models for compaction/formatting, frontier reasoning for math/code/physics
 */

import { type VaultCtx, getVaultDb } from "@/lib/dal/vault-dal";
import { listProviders } from "@/lib/providers-service";

export type IntentCategory =
  | "compaction"
  | "formatting"
  | "coding"
  | "math"
  | "physics"
  | "research"
  | "analysis"
  | "creative"
  | "default";

export type ModelTier = "fast" | "balanced" | "reasoning";

export interface RouterDecision {
  providerId: number;
  model: string;
  tier: ModelTier;
  reasoning: string;
}

export interface ProviderMeta {
  id: number;
  name: string;
  kind: "openai" | "anthropic";
  baseUrl: string;
  models: string[];
  isDefault: boolean;
  // Router-specific fields
  fastModels?: string[];
  reasoningModels?: string[];
  balancedModels?: string[];
}

// Intent taxonomy with keyword heuristics
export const INTENT_KEYWORDS: Record<IntentCategory, string[]> = {
  compaction: ["summarize", "compact", "shorten", "condense", "tl;dr", "tldr", "brief"],
  formatting: ["format", "prettify", "markdown", "table", "beautify", "indent", "lint"],
  coding: [
    "code",
    "function",
    "debug",
    "refactor",
    "typescript",
    "javascript",
    "python",
    "react",
    "hook",
    "component",
    "api",
    "endpoint",
    "class",
    "interface",
    "type",
  ],
  math: [
    "calculate",
    "derive",
    "solve",
    "proof",
    "equation",
    "integral",
    "derivative",
    "limit",
    "series",
    "matrix",
    "vector",
    "algebra",
    "calculus",
    "theorem",
  ],
  physics: [
    "force",
    "energy",
    "motion",
    "vector",
    "torque",
    "momentum",
    "angular",
    "kinetic",
    "potential",
    "lagrangian",
    "hamiltonian",
    "pendulum",
    "oscillation",
    "wave",
    "field",
    "bead",
    "wire",
    "rotation",
    "inertia",
    "centrifugal",
    "coriolis",
    "jee",
    "mechanics",
  ],
  research: ["search", "find", "lookup", "latest", "news", "current", "recent", "discover"],
  analysis: [
    "analyze",
    "compare",
    "evaluate",
    "pros",
    "cons",
    "trade-off",
    "tradeoff",
    "assess",
    "review",
    "critique",
  ],
  creative: ["write", "story", "poem", "brainstorm", "idea", "creative", "narrative", "script"],
  default: [],
};

// Model tier preferences (can be overridden by provider config)
export const TIER_MODEL_PREFERENCE: Record<ModelTier, string[]> = {
  fast: ["gpt-4o-mini", "haiku", "claude-3-5-haiku", "gemini-1.5-flash", "llama-3.1-8b"],
  balanced: ["gpt-4o", "sonnet", "claude-3-5-sonnet", "gemini-1.5-pro", "llama-3.1-70b"],
  reasoning: ["o1", "o1-pro", "sonnet-4", "claude-4", "gpt-5", "deepseek-r1", "qwq-32b"],
};

export const INTENT_TO_TIER: Record<IntentCategory, ModelTier> = {
  compaction: "fast",
  formatting: "fast",
  coding: "reasoning",
  math: "reasoning",
  physics: "reasoning",
  research: "fast",
  analysis: "reasoning",
  creative: "balanced",
  default: "balanced",
};

/**
 * Classify intent from user text using keyword heuristics
 */
export function classifyIntent(text: string): IntentCategory {
  const lower = text.toLowerCase();

  // Score each intent category
  let bestScore = 0;
  let bestCategory: IntentCategory = "default";

  for (const [category, keywords] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as IntentCategory;
    }
  }

  return bestCategory;
}

/**
 * Get all available providers with their model configs
 */
async function getProvidersUncached(ctx: VaultCtx): Promise<ProviderMeta[]> {
  const providers = listProviders(ctx);
  return providers.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    baseUrl: p.baseUrl,
    models: p.models,
    isDefault: p.isDefault,
    fastModels: [],
    reasoningModels: [],
    balancedModels: [],
  }));
}

/**
 * Select best model for a tier from a provider
 */
function selectModelForTier(provider: ProviderMeta, tier: ModelTier): string | null {
  const customModels = provider[`${tier}Models` as keyof ProviderMeta] as string[] | undefined;
  if (customModels?.length) return customModels[0];

  const preferences = TIER_MODEL_PREFERENCE[tier];
  for (const pref of preferences) {
    if (provider.models.includes(pref)) return pref;
  }

  // Fallback: first available model
  return provider.models[0] ?? null;
}

/**
 * Semantic Router — picks the right model/provider for the intent
 */
export class SemanticRouter {
  private providersCache: ProviderMeta[] | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 30_000; // 30s

  constructor(private ctx: VaultCtx) {}

  private async getProviders(): Promise<ProviderMeta[]> {
    const now = Date.now();
    if (this.providersCache && now - this.cacheTime < this.CACHE_TTL) {
      return this.providersCache;
    }

    this.providersCache = await getProvidersUncached(this.ctx);
    this.cacheTime = now;
    return this.providersCache;
  }

  /**
   * Route an intent to the best provider/model
   */
  async route(
    intent: string,
    hints?: { providerId?: number; model?: string; tier?: ModelTier }
  ): Promise<RouterDecision> {
    const category = classifyIntent(intent);
    const tier = hints?.tier ?? INTENT_TO_TIER[category];
    const providers = await this.getProviders();

    if (providers.length === 0) {
      throw new Error("No AI providers configured");
    }

    // If specific provider hinted, use it
    let targetProviders = providers;
    if (hints?.providerId) {
      targetProviders = providers.filter((p) => p.id === hints.providerId);
      if (targetProviders.length === 0) {
        throw new Error(`Provider ${hints.providerId} not found`);
      }
    }

    // Prefer default provider
    const defaultProvider = targetProviders.find((p) => p.isDefault) ?? targetProviders[0];

    // If specific model hinted, verify it exists
    if (hints?.model && defaultProvider.models.includes(hints.model)) {
      return {
        providerId: defaultProvider.id,
        model: hints.model,
        tier,
        reasoning: `User-specified model ${hints.model} for ${category} (${tier})`,
      };
    }

    // Select best model for tier
    const model = selectModelForTier(defaultProvider, tier);
    if (!model) {
      throw new Error(`No suitable ${tier} model found for provider ${defaultProvider.name}`);
    }

    return {
      providerId: defaultProvider.id,
      model,
      tier,
      reasoning: `Auto-selected ${tier} model "${model}" for ${category} intent`,
    };
  }

  /**
   * Get routing decision without executing — for UI preview
   */
  async previewRoute(intent: string): Promise<RouterDecision> {
    return this.route(intent);
  }

  /**
   * Invalidate provider cache (call when providers are added/removed)
   */
  invalidateCache(): void {
    this.providersCache = null;
    this.cacheTime = 0;
  }
}

/**
 * Create router instance with vault context
 */
export function createRouter(ctx: VaultCtx): SemanticRouter {
  return new SemanticRouter(ctx);
}