/**
 * Autonomous Background Runner for OpenDots — Phryvos-K9
 * 
 * Implements OpenDots' continuous autonomous background execution loop.
 * Periodically wakes up specialist coworkers, executes scheduled tasks,
 * uses tools autonomously, logs reports to Dot memory, and triggers
 * device notifications.
 */

import { exec } from "node:child_process";
import { getDb } from "@/lib/db/client";
import { getActiveMasterKey } from "@/lib/session/store";
import {
  claimDueDotTask,
  completeDotTask,
  appendDotMessage,
  updateDot,
  listDotSpaces,
  formatSpacesContext,
  type DotTaskDto,
  type DotDto,
} from "./dots-service";
import { defaultProvider, createLlmClient, listProviders } from "./providers-service";
import { runAgentTurn } from "./agent/loop";
import { ensureAgentTools } from "./agent/tools";
import { resolveApproval } from "./agent/guardrails";
import { enhancePromptWithEcc } from "./ai/prompts/ecc-instincts";
import { telegramGateway } from "./gateway/telegram-gateway";
import { runReMeDreamCycle } from "./memory/reme-service";
import { scrubSecrets } from "./dots/secret-scrubber";
import type { UnifiedMessage } from "./ai/types";

/**
 * Resolves the Dot's tools array into allowed tools for the agent runtime.
 * Strictly guarantees that tools: [] means 0 tools allowed ([]),
 * and only explicit wildcards (*, all, omni) resolve to undefined (all tools).
 */
export function resolveAllowedTools(tools: string[] | undefined | null): string[] | undefined {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return [];
  if (tools.includes("*") || tools.includes("all") || tools.includes("omni")) {
    return undefined; // All tools allowed
  }
  return [...tools];
}

export interface AutonomousRiskEvaluation {
  allowed: boolean;
  reason?: string;
}

/**
 * Risk-based tool permission evaluator for autonomous background execution.
 * Prevents irreversible mutations, credential alterations, and destructive OS actions
 * when running without an interactive human in the loop.
 */
export function evaluateAutonomousToolRisk(
  toolName: string,
  args: Record<string, unknown>
): AutonomousRiskEvaluation {
  const criticalTools = new Set([
    "delete_file",
    "purge_file",
    "run_js_code",
    "execute_terminal",
    "drop_table",
    "wipe_vault",
  ]);

  if (criticalTools.has(toolName)) {
    return {
      allowed: false,
      reason: `Destructive action "${toolName}" is blocked in autonomous background mode without prior human authorization.`,
    };
  }

  // If tool is terminal/bash_exec, check for destructive commands
  if (toolName === "terminal" || toolName === "bash_exec") {
    const cmd = String(args?.command || args?.cmd || "");
    if (/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|--force)\b/i.test(cmd)) {
      return {
        allowed: false,
        reason: `Destructive shell command ("rm -rf") is blocked in autonomous background mode.`,
      };
    }
  }

  return { allowed: true };
}

type GlobalRunner = { __phryvosDotRunner?: DotRunner };
const g = globalThis as unknown as GlobalRunner;

export class DotRunner {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private currentTaskId: string | null = null;
  private ticksSinceLastDream = 0;
  public abortControllers = new Map<string, AbortController>();

  private constructor() {}

  public static getInstance(): DotRunner {
    if (!g.__phryvosDotRunner) {
      g.__phryvosDotRunner = new DotRunner();
    }
    return g.__phryvosDotRunner;
  }

  public abortTask(taskId: string): boolean {
    const ac = this.abortControllers.get(taskId);
    if (!ac) return false;
    ac.abort();
    this.abortControllers.delete(taskId);
    return true;
  }

  public reconcileZombieTasks(db: any, maxStuckAgeMs: number = 10 * 60 * 1000): number {
    const cutoff = Date.now() - maxStuckAgeMs;
    const stuckTasks = db
      .prepare("SELECT * FROM dot_tasks WHERE status = 'running' AND (last_run_at IS NULL OR last_run_at <= ?)")
      .all(cutoff) as Array<{ id: string; retry_count: number; max_retries: number }>;

    let reconciled = 0;
    const now = Date.now();
    for (const t of stuckTasks) {
      const nextRetry = (t.retry_count ?? 0) + 1;
      const maxRetries = t.max_retries ?? 3;
      const nextStatus = nextRetry >= maxRetries ? "failed" : "queued";

      db.prepare(`
        UPDATE dot_tasks
        SET status = ?, retry_count = ?, error = ?, updated_at = ?
        WHERE id = ?
      `).run(
        nextStatus,
        nextRetry,
        "Interrupted execution: recovered from unexpected server restart or stalled process",
        now,
        t.id
      );
      reconciled++;
    }
    return reconciled;
  }

  public start(): void {
    if (this.timer) return;
    try {
      const db = getDb();
      this.reconcileZombieTasks(db);
    } catch {}
    this.timer = setInterval(() => {
      void this.tick();
    }, 10_000); // Check every 10 seconds
    this.timer.unref();
    void this.tick();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async tick(): Promise<void> {
    if (this.running) return;

    try {
      const masterKey = getActiveMasterKey();
      if (!masterKey) {
        // Vault is locked; wait for user unlock
        return;
      }

      const db = getDb();
      const claim = claimDueDotTask(db);
      if (!claim) {
        // Idle pass: periodically check if memories need auto-dream consolidation
        this.ticksSinceLastDream++;
        if (this.ticksSinceLastDream >= 30) {
          this.ticksSinceLastDream = 0;
          try {
            await runReMeDreamCycle({ db, key: masterKey });
          } catch (dreamErr) {
            console.error("[DotRunner] Auto-dream cycle error:", dreamErr);
          }
        }
        return;
      }

      this.running = true;
      this.currentTaskId = claim.task.id;

      await this.executeTask(db, masterKey, claim.task, claim.dot);
    } catch (err) {
      console.error("[DotRunner] Background tick error:", err);
    } finally {
      this.running = false;
      this.currentTaskId = null;
    }
  }

  /**
   * Run a task immediately on demand.
   */
  public async runTaskNow(taskId: string, dotId: string): Promise<boolean> {
    const masterKey = getActiveMasterKey();
    if (!masterKey) {
      throw new Error("Vault is locked. Unlock the vault first.");
    }

    const db = getDb();
    const taskRow = db.prepare("SELECT * FROM dot_tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
    const dotRow = db.prepare("SELECT * FROM dots WHERE id = ?").get(dotId) as Record<string, unknown> | undefined;
    if (!taskRow || !dotRow) return false;

    // Build claim objects
    const task: DotTaskDto = {
      id: String(taskRow.id),
      dotId: String(taskRow.dot_id),
      prompt: String(taskRow.prompt),
      status: "running",
      intervalSeconds: (taskRow.interval_seconds as number) ?? null,
      nextRunAt: (taskRow.next_run_at as number) ?? null,
      lastRunAt: (taskRow.last_run_at as number) ?? null,
      lastResult: (taskRow.last_result as string) ?? null,
      error: null,
      retryCount: Number(taskRow.retry_count ?? 0),
      maxRetries: Number(taskRow.max_retries ?? 3),
      createdAt: Number(taskRow.created_at),
      updatedAt: Date.now(),
    };

    const dot: DotDto = {
      id: String(dotRow.id),
      name: String(dotRow.name),
      character: dotRow.character as DotDto["character"],
      role: String(dotRow.role),
      description: String(dotRow.description || ""),
      systemPrompt: String(dotRow.system_prompt),
      model: String(dotRow.model),
      tools: JSON.parse(String(dotRow.tools || "[]")),
      status: "working",
      workingDirectory: String(dotRow.working_directory || process.cwd()),
      createdAt: Number(dotRow.created_at),
      updatedAt: Date.now(),
    };

    db.prepare("UPDATE dot_tasks SET status = 'running', updated_at = ? WHERE id = ?").run(Date.now(), taskId);
    await this.executeTask(db, masterKey, task, dot);
    return true;
  }

  private async executeTask(
    db: any,
    key: Buffer,
    task: DotTaskDto,
    dot: DotDto
  ): Promise<void> {
    const ctx = { db, key };
    const ac = new AbortController();
    this.abortControllers.set(task.id, ac);

    try {
      updateDot(ctx, dot.id, { status: "working" });
      ensureAgentTools();

      const allProviders = listProviders(ctx);
      let provider = defaultProvider(ctx) || allProviders[0];
      if (!provider) {
        throw new Error("No active AI provider configured in Settings.");
      }

      const client = createLlmClient(ctx, provider.id);
      let selectedModel = dot.model && dot.model !== "auto" ? dot.model : (provider.models[0] || "default");
      if (selectedModel !== "auto" && provider.models?.length && !provider.models.includes(selectedModel)) {
        selectedModel = provider.models[0] || "default";
      }

      // Inject Spaces persistent knowledge base (D-17)
      const spaces = listDotSpaces(ctx, dot.id);
      const spacesContext = formatSpacesContext(spaces);

      const messages: UnifiedMessage[] = [
        {
          role: "system",
          content: `${enhancePromptWithEcc(dot.systemPrompt, dot.role)}\n\nYou are operating as the specialist coworker "${dot.name}" (${dot.role}).\nYour working environment is "${dot.workingDirectory}".\nEnabled tools: ${dot.tools.join(", ")}.\n\nTHIS IS A SCHEDULED AUTONOMOUS TASK RUN. Perform necessary tool calls (terminal commands, search, files, analysis), observe outcomes, and generate a concise, high-value summary of what you did.${spacesContext}`,
        },
        {
          role: "user",
          content: `[SCHEDULED AUTONOMOUS TASK]:\n${task.prompt}`,
        },
      ];

      const allowedTools = resolveAllowedTools(dot.tools);

      const result = await runAgentTurn({
        db,
        key,
        client,
        model: selectedModel,
        allowedTools,
        initialMessages: messages,
        signal: ac.signal,
        maxSteps: 8,
        autoApproveTools: true, // Non-critical tools only; critical tools still require approval
        providerTimeoutMs: 120_000,
        onDelta: () => {},
        onStep: () => {},
        onApprovalRequest: (approval) => {
          // Autonomous background runs cannot block on interactive UI input; auto-deny critical destructive actions
          resolveApproval(approval.approvalId, "deny");
        },
        appendAssistant: () => {},
        appendTool: () => {},
      });

      const finalReport = result.text.trim() || "Autonomous task executed successfully.";

      // Record result into Dot's conversation history
      appendDotMessage(ctx, dot.id, {
        role: "assistant",
        content: `🤖 **[Autonomous Scheduled Task Completed]**\n\n> 📋 **Task:** ${task.prompt}\n\n${finalReport}`,
      });

      // Complete task record and update schedule
      completeDotTask(db, task.id, { resultText: finalReport });
      updateDot(ctx, dot.id, { status: "complete" });

      // Trigger Android Phone Notification if termux-api is available (scrubbed D-19)
      const cleanPrompt = scrubSecrets(task.prompt);
      const cleanReport = scrubSecrets(finalReport);
      this.sendNotification(
        `${dot.name} (AI Coworker)`,
        `Completed: ${cleanPrompt.slice(0, 45)}${cleanPrompt.length > 45 ? "…" : ""}`
      );

      // OpenClaw Proactive Push to Telegram (scrubbed D-19)
      void telegramGateway.broadcast(
        db,
        `✔ *${dot.name} (${dot.role}) Completed Task*\n\n📋 *Task:* ${cleanPrompt}\n\n${cleanReport.slice(0, 250)}${cleanReport.length > 250 ? "…" : ""}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[DotRunner] Task ${task.id} failed:`, msg);
      completeDotTask(db, task.id, { error: msg });
      updateDot(ctx, dot.id, { status: "idle" });

      const cleanPrompt = scrubSecrets(task.prompt);
      const cleanError = scrubSecrets(msg);

      // OpenClaw Push Alert on Failure (scrubbed D-19)
      void telegramGateway.broadcast(
        db,
        `⚠️ *${dot.name} Task Failed*\n\n📋 *Task:* ${cleanPrompt}\n\n*Error:* ${cleanError}`
      );

      appendDotMessage(ctx, dot.id, {
        role: "assistant",
        content: `⚠️ **[Autonomous Task Warning]**\n\n> 📋 **Task:** ${cleanPrompt}\n\n*Error encountered during background run:* ${cleanError}`,
      });
    } finally {
      this.abortControllers.delete(task.id);
    }
  }

  private sendNotification(title: string, content: string): void {
    const escapedTitle = title.replace(/'/g, "'\\''");
    const escapedContent = content.replace(/'/g, "'\\''");
    exec(`termux-notification --title '${escapedTitle}' --content '${escapedContent}' --priority high 2>/dev/null || true`);
  }
}

export const dotRunner = DotRunner.getInstance();
