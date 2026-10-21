/**
 * DeepSeek Harness Plugin Chassis for Phryvos-K9
 * Inspired by deepseek-ai/deepseek-harness (dsh)
 * 
 * Implements "Everything is a Plugin" (Cordis architecture):
 * 1. Pluggable lifecycle hooks: beforeTurn, onToolCall, onStep, afterTurn
 * 2. Dynamic runtime enable/disable per plugin
 * 3. Pre-configured built-in plugins (PII scrubber, ECC instincts, Git worktrees, ReMe, Telegram, Free Frontier)
 * 4. Automatic step trace logging through audit-tracer
 */

import type { VaultCtx } from "@/lib/vault-service";
import type { UnifiedMessage } from "@/lib/ai/types";
import { recordAuditStep } from "./audit-tracer";

export type PluginCategory = "safety" | "memory" | "tools" | "gateway" | "workflow" | "core";

export interface PluginHookDecision {
  allow: boolean;
  modifiedArgs?: Record<string, any>;
  reason?: string;
}

export interface DshPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  category: PluginCategory;
  enabled: boolean;
  author?: string;
  isCore?: boolean;
  hooks?: {
    beforeTurn?: (
      ctx: VaultCtx,
      messages: UnifiedMessage[],
      options?: Record<string, any>,
    ) => Promise<UnifiedMessage[] | void>;
    onToolCall?: (
      ctx: VaultCtx,
      toolName: string,
      args: Record<string, any>,
    ) => Promise<PluginHookDecision | void>;
    onStep?: (
      ctx: VaultCtx,
      stepInfo: { step: number; tool: string; args: Record<string, any>; result: string; durationMs?: number },
    ) => Promise<void>;
    afterTurn?: (
      ctx: VaultCtx,
      resultText: string,
    ) => Promise<string | void>;
  };
}

class DshPluginChassis {
  private plugins = new Map<string, DshPlugin>();

  constructor() {
    this.registerBuiltinPlugins();
  }

  /**
   * Registers a plugin into the chassis
   */
  public registerPlugin(plugin: DshPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * Enables a plugin
   */
  public enablePlugin(id: string): boolean {
    const p = this.plugins.get(id);
    if (!p) return false;
    p.enabled = true;
    return true;
  }

  /**
   * Disables a plugin (unless marked as immutable core)
   */
  public disablePlugin(id: string): boolean {
    const p = this.plugins.get(id);
    if (!p || p.isCore) return false;
    p.enabled = false;
    return true;
  }

  /**
   * Returns a specific plugin by ID
   */
  public getPlugin(id: string): DshPlugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * Lists all registered plugins
   */
  public listPlugins(): DshPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Runs all active beforeTurn hooks across enabled plugins
   */
  public async runBeforeTurnHooks(
    ctx: VaultCtx,
    messages: UnifiedMessage[],
    options?: Record<string, any>,
  ): Promise<UnifiedMessage[]> {
    let currentMessages = [...messages];

    for (const plugin of this.plugins.values()) {
      if (plugin.enabled && plugin.hooks?.beforeTurn) {
        try {
          const transformed = await plugin.hooks.beforeTurn(ctx, currentMessages, options);
          if (transformed && Array.isArray(transformed)) {
            currentMessages = transformed;
          }
        } catch (err) {
          console.error(`[DshChassis] Plugin ${plugin.id} beforeTurn error:`, err);
        }
      }
    }

    recordAuditStep({
      stepNumber: 0,
      phase: "prompt",
      thinkingSnippet: `Messages processed through ${this.getActivePluginCount()} active plugins`,
    });

    return currentMessages;
  }

  /**
   * Runs all active onToolCall hooks. If any hook returns allow: false, the tool call is blocked.
   */
  public async runToolCallHooks(
    ctx: VaultCtx,
    toolName: string,
    args: Record<string, any>,
  ): Promise<PluginHookDecision> {
    let currentArgs = { ...args };

    for (const plugin of this.plugins.values()) {
      if (plugin.enabled && plugin.hooks?.onToolCall) {
        try {
          const decision = await plugin.hooks.onToolCall(ctx, toolName, currentArgs);
          if (decision) {
            if (!decision.allow) {
              recordAuditStep({
                stepNumber: 0,
                phase: "safety_block",
                toolName,
                toolArgs: currentArgs,
                toolResultSnippet: `Blocked by plugin [${plugin.name}]: ${decision.reason || "Safety check"}`,
              });
              return decision;
            }
            if (decision.modifiedArgs) {
              currentArgs = decision.modifiedArgs;
            }
          }
        } catch (err) {
          console.error(`[DshChassis] Plugin ${plugin.id} onToolCall error:`, err);
        }
      }
    }

    recordAuditStep({
      stepNumber: 0,
      phase: "tool_call",
      toolName,
      toolArgs: currentArgs,
    });

    return { allow: true, modifiedArgs: currentArgs };
  }

  /**
   * Runs all active onStep hooks after a tool finishes
   */
  public async runStepHooks(
    ctx: VaultCtx,
    stepInfo: { step: number; tool: string; args: Record<string, any>; result: string; durationMs?: number },
  ): Promise<void> {
    recordAuditStep({
      stepNumber: stepInfo.step,
      phase: "tool_result",
      toolName: stepInfo.tool,
      toolArgs: stepInfo.args,
      toolResultSnippet: stepInfo.result.slice(0, 300),
      durationMs: stepInfo.durationMs,
    });

    for (const plugin of this.plugins.values()) {
      if (plugin.enabled && plugin.hooks?.onStep) {
        try {
          await plugin.hooks.onStep(ctx, stepInfo);
        } catch (err) {
          console.error(`[DshChassis] Plugin ${plugin.id} onStep error:`, err);
        }
      }
    }
  }

  /**
   * Runs all active afterTurn hooks
   */
  public async runAfterTurnHooks(
    ctx: VaultCtx,
    resultText: string,
  ): Promise<string> {
    let currentText = resultText;

    for (const plugin of this.plugins.values()) {
      if (plugin.enabled && plugin.hooks?.afterTurn) {
        try {
          const modified = await plugin.hooks.afterTurn(ctx, currentText);
          if (typeof modified === "string") {
            currentText = modified;
          }
        } catch (err) {
          console.error(`[DshChassis] Plugin ${plugin.id} afterTurn error:`, err);
        }
      }
    }

    recordAuditStep({
      stepNumber: 0,
      phase: "completion",
      thinkingSnippet: currentText.slice(0, 200),
    });

    return currentText;
  }

  public getActivePluginCount(): number {
    let count = 0;
    for (const p of this.plugins.values()) {
      if (p.enabled) count++;
    }
    return count;
  }

  private registerBuiltinPlugins(): void {
    // 1. Ruflo PII Scrubber Plugin
    this.registerPlugin({
      id: "pii-scrubber",
      name: "Ruflo PII Masking Shield",
      version: "1.0.0",
      description: "Automatically detects and masks passwords, private tokens, phone numbers, and keys before LLM dispatch.",
      category: "safety",
      enabled: true,
      author: "Ruflo",
      isCore: false,
    });

    // 2. ECC Instincts Verification Plugin
    this.registerPlugin({
      id: "ecc-instincts",
      name: "ECC Surgical Verification Rules",
      version: "1.2.0",
      description: "Enforces surgical diff edits, root-cause diagnostics, and verification checks on all AI coworkers.",
      category: "workflow",
      enabled: true,
      author: "affaan-m",
      isCore: true,
    });

    // 3. Orca Git Worktree Engine
    this.registerPlugin({
      id: "git-worktrees",
      name: "Orca Worktree Branching Seam",
      version: "1.0.0",
      description: "Provides isolated git worktree working directories for multi-agent coworker parallelism without branch collisions.",
      category: "tools",
      enabled: true,
      author: "stablyai",
      isCore: false,
    });

    // 4. ReMe File-as-Memory (QwenPaw)
    this.registerPlugin({
      id: "reme-memory",
      name: "ReMe 3-Layer Memory & Auto-Dream",
      version: "2.1.0",
      description: "Human-readable Markdown memory vault docs with [[wikilinks]], hybrid RRF retrieval, and idle dream cycles.",
      category: "memory",
      enabled: true,
      author: "agentscope-ai",
      isCore: true,
    });

    // 5. OpenClaw Master Gateway
    this.registerPlugin({
      id: "telegram-gateway",
      name: "OpenClaw Outbound Push Gateway",
      version: "1.5.0",
      description: "Proactive long-polling Telegram device pairing, remote slash commands, and phone alerts.",
      category: "gateway",
      enabled: true,
      author: "openclaw",
      isCore: false,
    });

    // 6. Free Frontier Models Plugin
    this.registerPlugin({
      id: "free-frontier-models",
      name: "Zero-Config Free Frontier Models",
      version: "1.0.0",
      description: "Direct zero-key public gateway access to DeepSeek V4.1 Flash, DeepSeek R1, Moonshot Kimi K3, and Qwen 2.5 Coder.",
      category: "gateway",
      enabled: true,
      author: "Ebony-Vinyl",
      isCore: false,
    });

    // 7. Audit Step Tracer
    this.registerPlugin({
      id: "audit-tracer",
      name: "DeepSeek Step Traceability Logger",
      version: "1.0.0",
      description: "Records sub-millisecond step-by-step audit trails for tools, thinking traces, and agent decisions.",
      category: "core",
      enabled: true,
      author: "deepseek-ai",
      isCore: true,
    });
  }
}

// Global singleton instance
type GlobalChassis = { __phryvosDshChassis?: DshPluginChassis };
const g = globalThis as unknown as GlobalChassis;

if (!g.__phryvosDshChassis) {
  g.__phryvosDshChassis = new DshPluginChassis();
}

export const dshChassis = g.__phryvosDshChassis;
