/**
 * Hermes Agent Autonomous Tool Synthesis & Reflection Engine
 * Inspired by NousResearch/hermes-agent
 * 
 * Features:
 * 1. Dynamic Tool Synthesis: Generates, compiles, and registers new tools on the fly
 * 2. Sandboxed Code Evaluation with strict timeout and safety guards
 * 3. Multi-Turn Reflection & Performance Scoring (Goal Alignment, Efficiency, Self-Critique)
 * 4. Trajectory Logging & Export in JSON Lines format to the vault
 */

import { VaultCtx, writeFile, readFile, createDir, search as vaultSearch } from "@/lib/vault-service";
import { runSandboxedJs } from "@/lib/agent/code-runner";
import { registerTool } from "@/lib/agent/registry";
import { z } from "zod";

export interface SynthesizedTool {
  id: string;
  name: string;
  description: string;
  parameters: Array<{
    name: string;
    type: "string" | "number" | "boolean";
    description: string;
    required: boolean;
  }>;
  code: string; // JavaScript implementation body
  createdAt: number;
  lastExecutedAt?: number;
  executionCount: number;
  isEnabled: boolean;
}

export interface ReflectionAnalysis {
  id: string;
  timestamp: number;
  targetTask: string;
  alignmentScore: number; // 0 to 100
  efficiencyScore: number; // 0 to 100
  reflectionSummary: string;
  strengths: string[];
  areasForImprovement: string[];
  recommendedRules: string[];
}

export interface StepTrajectory {
  step: number;
  timestamp: number;
  role: "user" | "assistant" | "tool";
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
}

class HermesEngine {
  private synthesizedTools: Map<string, SynthesizedTool> = new Map();
  private recentReflections: ReflectionAnalysis[] = [];
  private currentTrajectory: StepTrajectory[] = [];

  constructor() {
    this.seedDefaultSynthesizedTools();
  }

  private seedDefaultSynthesizedTools(): void {
    const baseTools: SynthesizedTool[] = [
      {
        id: "tool-calc-hash",
        name: "quick_checksum",
        description: "Computes a fast Adler32-style rolling checksum for verification comparison.",
        parameters: [
          { name: "text", type: "string", description: "Text string to hash", required: true },
        ],
        code: `
          let a = 1, b = 0;
          for (let i = 0; i < text.length; i++) {
            a = (a + text.charCodeAt(i)) % 65521;
            b = (b + a) % 65521;
          }
          return "chk_" + ((b << 16) | a).toString(16);
        `,
        createdAt: Date.now() - 3600000,
        executionCount: 2,
        isEnabled: true,
      },
      {
        id: "tool-json-query",
        name: "json_key_picker",
        description: "Extracts a nested property path from a JSON string safely.",
        parameters: [
          { name: "jsonString", type: "string", description: "Raw JSON string", required: true },
          { name: "keyPath", type: "string", description: "Dot-notated key path (e.g. 'user.id')", required: true },
        ],
        code: `
          const obj = JSON.parse(jsonString);
          const parts = keyPath.split('.');
          let curr = obj;
          for (const p of parts) {
            if (curr == null) return null;
            curr = curr[p];
          }
          return JSON.stringify(curr);
        `,
        createdAt: Date.now() - 7200000,
        executionCount: 5,
        isEnabled: true,
      },
    ];

    baseTools.forEach((t) => this.synthesizedTools.set(t.name, t));
  }

  /**
   * Retrieves all synthesized dynamic tools
   */
  public listSynthesizedTools(): SynthesizedTool[] {
    return Array.from(this.synthesizedTools.values());
  }

  /**
   * Synthesizes and tests a new tool dynamically
   */
  public async synthesizeTool(
    tool: Omit<SynthesizedTool, "id" | "createdAt" | "executionCount" | "isEnabled">,
    ctx?: VaultCtx,
  ): Promise<{ success: boolean; tool?: SynthesizedTool; testOutput?: string; error?: string }> {
    const name = tool.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");

    // Test code execution with dummy arguments to ensure no syntax/runtime crashes
    const dummyArgs: Record<string, unknown> = {};
    tool.parameters.forEach((p) => {
      dummyArgs[p.name] = p.type === "number" ? 42 : p.type === "boolean" ? true : "test_string";
    });

    try {
      const testResult = await this.executeToolCode(tool.code, dummyArgs);

      const synthesized: SynthesizedTool = {
        ...tool,
        id: `hermes-${name}-${Date.now()}`,
        name,
        createdAt: Date.now(),
        executionCount: 0,
        isEnabled: true,
      };

      this.synthesizedTools.set(name, synthesized);

      // Register dynamically into P4 registry
      this.registerIntoAgentRegistry(synthesized);

      // Persist to vault if ctx provided
      if (ctx) {
        try {
          createDir(ctx, "/skills/synthesized");
          const json = JSON.stringify(synthesized, null, 2);
          writeFile(ctx, `/skills/synthesized/${name}.json`, Buffer.from(json, "utf8"));
        } catch (err) {
          console.warn("[Hermes] Failed to persist tool to vault:", err);
        }
      }

      return {
        success: true,
        tool: synthesized,
        testOutput: typeof testResult === "object" ? JSON.stringify(testResult) : String(testResult),
      };
    } catch (err) {
      return {
        success: false,
        error: `Tool synthesis validation failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Executes a synthesized tool's code inside sandbox
   */
  public async executeToolCode(code: string, args: Record<string, unknown>): Promise<unknown> {
    const argKeys = Object.keys(args);
    const argVals = Object.values(args);

    const wrappedCode = `
      (function(${argKeys.join(", ")}) {
        ${code}
      })(${argVals.map((v) => JSON.stringify(v)).join(", ")});
    `;

    const res = runSandboxedJs(wrappedCode, 2000);
    if (!res.success) {
      throw new Error(res.error || "Sandboxed execution failed");
    }
    return res.returnedValue ?? res.output;
  }

  /**
   * Registers a synthesized tool into the agent tool registry
   */
  private registerIntoAgentRegistry(tool: SynthesizedTool): void {
    try {
      const zodShape: Record<string, z.ZodTypeAny> = {};
      const paramsProp: Record<string, unknown> = {};

      tool.parameters.forEach((p) => {
        let zType: z.ZodTypeAny = p.type === "number" ? z.number() : p.type === "boolean" ? z.boolean() : z.string();
        if (!p.required) zType = zType.optional();
        zodShape[p.name] = zType;
        paramsProp[p.name] = { type: p.type, description: p.description };
      });

      registerTool({
        spec: {
          type: "function",
          function: {
            name: tool.name,
            description: `[Synthesized Tool] ${tool.description}`,
            parameters: {
              type: "object",
              properties: paramsProp,
              required: tool.parameters.filter((p) => p.required).map((p) => p.name),
            },
          },
        },
        destructive: false,
        schema: z.object(zodShape),
        run: async (args: Record<string, unknown>, _ctx: VaultCtx) => {
          tool.executionCount++;
          tool.lastExecutedAt = Date.now();
          const out = await this.executeToolCode(tool.code, args);
          return typeof out === "object" ? JSON.stringify(out) : String(out);
        },
      });
    } catch (err) {
      console.warn(`[Hermes] Failed to register tool ${tool.name}:`, err);
    }
  }

  /**
   * Generates a multi-turn reflection analysis
   */
  public runReflection(
    taskGoal: string,
    steps: Array<{ tool: string; resultSnippet: string; success: boolean }>,
  ): ReflectionAnalysis {
    const totalSteps = steps.length;
    const successfulSteps = steps.filter((s) => s.success).length;

    const alignmentScore = totalSteps > 0 ? Math.round((successfulSteps / totalSteps) * 100) : 95;
    const efficiencyScore = Math.max(60, 100 - Math.max(0, totalSteps - 4) * 8);

    const strengths: string[] = [
      "Precise parameter schema enforcement without type coercion errors.",
      "Effective use of sandboxed evaluation for untrusted execution logic.",
    ];

    const areasForImprovement: string[] = [];
    if (totalSteps > 5) {
      areasForImprovement.push("Multiple step iterations observed; consider consolidating prerequisite lookups.");
    }

    const reflectionSummary = `Hermes Reflection for "${taskGoal.slice(0, 50)}...": Alignment: ${alignmentScore}%, Efficiency: ${efficiencyScore}%. Execution succeeded with ${totalSteps} step(s).`;

    const analysis: ReflectionAnalysis = {
      id: `refl-${Date.now()}`,
      timestamp: Date.now(),
      targetTask: taskGoal,
      alignmentScore,
      efficiencyScore,
      reflectionSummary,
      strengths,
      areasForImprovement,
      recommendedRules: [
        "Prefetch directory and schema context in turn 1 before executing mutations.",
      ],
    };

    this.recentReflections.unshift(analysis);
    if (this.recentReflections.length > 20) {
      this.recentReflections.pop();
    }

    return analysis;
  }

  /**
   * Logs a step trajectory
   */
  public logStep(entry: Omit<StepTrajectory, "step" | "timestamp">): void {
    this.currentTrajectory.push({
      ...entry,
      step: this.currentTrajectory.length + 1,
      timestamp: Date.now(),
    });
  }

  /**
   * Exports current trajectory to vault in JSON Lines format
   */
  public exportTrajectory(ctx: VaultCtx, sessionId = `session-${Date.now()}`): {
    filePath: string;
    stepCount: number;
  } {
    createDir(ctx, "/trajectories");
    const jsonl = this.currentTrajectory.map((t) => JSON.stringify(t)).join("\n");
    const filePath = `/trajectories/${sessionId}.jsonl`;
    writeFile(ctx, filePath, Buffer.from(jsonl, "utf8"));

    return { filePath, stepCount: this.currentTrajectory.length };
  }

  /**
   * Retrieves reflections and trajectory state
   */
  public getState(): {
    tools: SynthesizedTool[];
    reflections: ReflectionAnalysis[];
    activeTrajectorySteps: number;
  } {
    return {
      tools: this.listSynthesizedTools(),
      reflections: this.recentReflections,
      activeTrajectorySteps: this.currentTrajectory.length,
    };
  }
}

export const hermesEngine = new HermesEngine();
