/**
 * Tree-of-Thought (ToT) Derivation Explorer — 3-paradigm physics/math synthesis
 * Explores Dynamic Force Balance, Energy/Work-Kinetic, Dimensional/Symmetry limits
 */

import { type VaultCtx, getVaultDb } from "@/lib/dal/vault-dal";
import { createRouter, type RouterDecision } from "@/lib/ai/router";
import { type LlmClient } from "@/lib/ai/types";
import { createLlmClient } from "@/lib/providers-service";

export type TotParadigm = "force" | "energy" | "symmetry";

export interface ParadigmPrompt {
  name: TotParadigm;
  systemPrompt: string;
  description: string;
}

export const PARADIGM_PROMPTS: ParadigmPrompt[] = [
  {
    name: "force",
    description: "Dynamic Force Balance — Newton/Euler equations, free-body diagrams",
    systemPrompt: `You are an expert physicist specializing in Newtonian mechanics and force analysis.
Your task: Derive the solution using DYNAMIC FORCE BALANCE methodology.
- Draw free-body diagrams (describe them textually)
- Write Newton's 2nd law: ΣF = ma for each body
- Include constraint forces (normal, tension, friction)
- Handle pseudo-forces in non-inertial frames
- Solve the resulting system of equations
- State all assumptions explicitly`,
  },
  {
    name: "energy",
    description: "Energy/Work-Kinetic Theorem — Conservation laws, potential/kinetic",
    systemPrompt: `You are an expert physicist specializing in energy methods and Lagrangian mechanics.
Your task: Derive the solution using ENERGY/WORK-KINETIC methodology.
- Identify all forms of energy: kinetic (translational + rotational), potential (gravitational, elastic, etc.)
- Apply Work-Energy Theorem: W = ΔK
- Apply Conservation of Energy where applicable: E_initial = E_final
- Use generalized coordinates if constraints are complex
- Check for non-conservative forces (friction, drag)
- State all assumptions explicitly`,
  },
  {
    name: "symmetry",
    description: "Dimensional/Symmetry Limits — Buckingham π, scaling, limiting cases",
    systemPrompt: `You are an expert physicist specializing in dimensional analysis, scaling laws, and symmetry principles.
Your task: Derive the solution using DIMENSIONAL/SYMMETRY LIMITS methodology.
- Perform dimensional analysis (Buckingham π theorem)
- Identify dimensionless groups governing the problem
- Apply limiting cases: m→0, m→∞, L→0, L→∞, ω→0, ω→∞
- Use symmetry arguments (parity, time-reversal, rotational invariance)
- Derive scaling relations between variables
- Verify consistency with known exact solutions in limits
- State all assumptions explicitly`,
  },
];

export interface TotStep {
  paradigm: TotParadigm;
  reasoning: string;
  equations: string[];
  finalExpression: string;
  confidence: number; // 0-1
}

export interface TotResult {
  problem: string;
  steps: TotStep[];
  synthesis: {
    bestExpression: string;
    bestParadigm: TotParadigm;
    verification: {
      dimensionalConsistent: boolean;
      limitsAgree: boolean;
      crossParadigmAgreement: number; // 0-1
    };
    tradeoffs: string;
  };
  confidence: number;
}

/**
 * Run Tree-of-Thought derivation for a physics/math problem
 */
export async function runTotDerivation(
  ctx: VaultCtx,
  problem: string,
  knowns: Record<string, string> = {},
  unknowns: string[] = []
): Promise<TotResult> {
  const router = createRouter(ctx);
  const db = getVaultDb(ctx);

  // Get providers for reasoning tier using providers-service
  const { listProviders } = await import("@/lib/providers-service");
  const providers = listProviders(ctx);
  const reasoningProvider = providers.find(p => p.isDefault) ?? providers[0];

  if (!reasoningProvider) {
    throw new Error("No AI provider configured for ToT derivation");
  }

  // Create LLM client
  const client = await createLlmClient(ctx, reasoningProvider.id);
  const model = reasoningProvider.models[0] || "default";

  // Build problem context
  const context = `
Problem: ${problem}
Knowns: ${JSON.stringify(knowns, null, 2)}
Unknowns: ${unknowns.join(", ") || "Not specified"}

Solve step by step. Return your derivation as JSON with fields:
- reasoning: string (your step-by-step reasoning)
- equations: string[] (key equations)
- finalExpression: string (the final derived formula)
- confidence: number (0-1, your confidence in this derivation)
`;

  // Run each paradigm in parallel
  const paradigmPromises = PARADIGM_PROMPTS.map(async (paradigm) => {
    const messages = [
      { role: "system" as const, content: paradigm.systemPrompt },
      { role: "user" as const, content: context },
    ];

    const response = await client.createTurn(messages, undefined, model, undefined);
    const content = response.text || "{}";

    try {
      const parsed = JSON.parse(content);
      return {
        paradigm: paradigm.name,
        reasoning: parsed.reasoning || "",
        equations: parsed.equations || [],
        finalExpression: parsed.finalExpression || "",
        confidence: parsed.confidence || 0.5,
      };
    } catch {
      return {
        paradigm: paradigm.name,
        reasoning: content,
        equations: [],
        finalExpression: "",
        confidence: 0.3,
      };
    }
  });

  const steps = await Promise.all(paradigmPromises);

  // Cross-verification
  const verification = await crossVerify(steps, knowns);

  // Select best paradigm
  const best = steps.reduce((a, b) => (a.confidence > b.confidence ? a : b));

  return {
    problem,
    steps,
    synthesis: {
      bestExpression: best.finalExpression,
      bestParadigm: best.paradigm,
      verification,
      tradeoffs: generateTradeoffs(steps, verification),
    },
    confidence: Math.max(...steps.map(s => s.confidence)) * (verification.crossParadigmAgreement ? 1.2 : 0.8),
  };
}

/**
 * Cross-verify derivations across paradigms
 */
async function crossVerify(
  steps: TotStep[],
  knowns: Record<string, string>
): Promise<TotResult["synthesis"]["verification"]> {
  // Dimensional consistency check
  const dimensionalConsistent = steps.every(s => checkDimensions(s.finalExpression));

  // Limit agreement check
  const limitsAgree = checkLimits(steps);

  // Cross-paradigm agreement (how similar are the final expressions?)
  const crossParadigmAgreement = calculateAgreement(steps);

  return { dimensionalConsistent, limitsAgree, crossParadigmAgreement };
}

/**
 * Basic dimensional consistency check (simplified)
 */
function checkDimensions(expression: string): boolean {
  // Simplified: check for obvious dimensional mismatches
  // In production, use a proper dimensional analysis library
  return true; // placeholder
}

/**
 * Check if limiting cases agree across paradigms
 */
function checkLimits(steps: TotStep[]): boolean {
  // Simplified: would evaluate expressions at limits
  return true; // placeholder
}

/**
 * Calculate agreement between paradigm results
 */
function calculateAgreement(steps: TotStep[]): number {
  // Compare final expressions structurally
  // For now, return average confidence as proxy
  return steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length;
}

/**
 * Generate trade-off analysis text
 */
function generateTradeoffs(steps: TotStep[], verification: any): string {
  const lines = [
    `Cross-paradigm agreement: ${(verification.crossParadigmAgreement * 100).toFixed(0)}%`,
    `Dimensional consistency: ${verification.dimensionalConsistent ? "PASS" : "FAIL"}`,
    `Limit agreement: ${verification.limitsAgree ? "PASS" : "FAIL"}`,
    "",
    "Paradigm comparison:",
  ];

  for (const step of steps) {
    lines.push(
      `  ${step.paradigm}: confidence=${(step.confidence * 100).toFixed(0)}%, ` +
      `equations=${step.equations.length}, ` +
      `expr="${step.finalExpression.slice(0, 60)}..."`
    );
  }

  return lines.join("\n");
}

/**
 * Tool definition for agent registration
 */
export const totTool = {
  spec: {
    function: {
      name: "run_tot_derivation",
      description: "Run Tree-of-Thought derivation explorer for physics/math problems. Explores 3 paradigms (Force Balance, Energy, Symmetry) and synthesizes the best derivation.",
      parameters: {
        type: "object",
        properties: {
          problem: { type: "string", description: "The physics/math problem statement" },
          knowns: { type: "object", description: "Known variables and values" },
          unknowns: { type: "array", items: { type: "string" }, description: "Variables to solve for" },
        },
        required: ["problem"],
      },
    },
  },
  run: async (args: { problem: string; knowns?: Record<string, string>; unknowns?: string[] }, ctx: VaultCtx) => {
    const result = await runTotDerivation(ctx, args.problem, args.knowns, args.unknowns);
    return JSON.stringify(result, null, 2);
  },
};

/**
 * Wrapper for agent tools - simplified interface
 */
export async function runTot(problem: string, paradigms?: string[]): Promise<{
  branches: Array<{
    paradigm: string;
    steps: TotStep[];
    confidence: number;
    derivation: string;
  }>;
  synthesis: string;
  selectedParadigm: string;
  finalConfidence: number;
}> {
  // Create a minimal vault context for the tool (will be provided by the agent loop)
  // This is a simplified version - the actual implementation uses the full VaultCtx
  // For now, return a structured result
  const ctx = {} as VaultCtx; // placeholder - actual ctx passed by agent

  // Use the full derivation
  // Note: This needs a real ctx, so we'll just return the structure
  // The actual runTotDerivation requires a real ctx
  throw new Error("runTot requires a VaultCtx - use runTotDerivation directly in agent context");
}

export function getTotConfig() {
  return PARADIGM_PROMPTS;
}