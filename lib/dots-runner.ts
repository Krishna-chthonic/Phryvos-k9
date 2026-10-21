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
  type DotTaskDto,
  type DotDto,
} from "./dots-service";
import { defaultProvider, createLlmClient } from "./providers-service";
import { runAgentTurn } from "./agent/loop";
import { ensureAgentTools } from "./agent/tools";
import type { UnifiedMessage } from "./ai/types";

type GlobalRunner = { __phryvosDotRunner?: DotRunner };
const g = globalThis as unknown as GlobalRunner;

export class DotRunner {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private currentTaskId: string | null = null;

  private constructor() {}

  public static getInstance(): DotRunner {
    if (!g.__phryvosDotRunner) {
      g.__phryvosDotRunner = new DotRunner();
    }
    return g.__phryvosDotRunner;
  }

  public start(): void {
    if (this.timer) return;
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
      if (!claim) return;

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

    try {
      updateDot(ctx, dot.id, { status: "working" });
      ensureAgentTools();

      const provider = defaultProvider(ctx);
      if (!provider) {
        throw new Error("No active AI provider configured in Settings.");
      }

      const client = createLlmClient(ctx, provider.id);
      const selectedModel = dot.model && dot.model !== "auto" ? dot.model : (provider.models[0] || "default");

      const messages: UnifiedMessage[] = [
        {
          role: "system",
          content: `${dot.systemPrompt}\n\nYou are operating as the specialist coworker "${dot.name}" (${dot.role}).\nYour working environment is "${dot.workingDirectory}".\nEnabled tools: ${dot.tools.join(", ")}.\n\nTHIS IS A SCHEDULED AUTONOMOUS TASK RUN. Perform necessary tool calls (terminal commands, search, files, analysis), observe outcomes, and generate a concise, high-value summary of what you did.`,
        },
        {
          role: "user",
          content: `[SCHEDULED AUTONOMOUS TASK]:\n${task.prompt}`,
        },
      ];

      const result = await runAgentTurn({
        db,
        key,
        client,
        model: selectedModel,
        initialMessages: messages,
        maxSteps: 8,
        autoApproveTools: true, // Autonomous execution
        providerTimeoutMs: 120_000,
        onDelta: () => {},
        onStep: () => {},
        onApprovalRequest: () => {},
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

      // Trigger Android Phone Notification if termux-api is available
      this.sendNotification(
        `${dot.name} (AI Coworker)`,
        `Completed: ${task.prompt.slice(0, 45)}${task.prompt.length > 45 ? "…" : ""}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[DotRunner] Task ${task.id} failed:`, msg);
      completeDotTask(db, task.id, { error: msg });
      updateDot(ctx, dot.id, { status: "idle" });

      appendDotMessage(ctx, dot.id, {
        role: "assistant",
        content: `⚠️ **[Autonomous Task Warning]**\n\n> 📋 **Task:** ${task.prompt}\n\n*Error encountered during background run:* ${msg}`,
      });
    }
  }

  private sendNotification(title: string, content: string): void {
    const escapedTitle = title.replace(/'/g, "'\\''");
    const escapedContent = content.replace(/'/g, "'\\''");
    exec(`termux-notification --title '${escapedTitle}' --content '${escapedContent}' --priority high 2>/dev/null || true`);
  }
}

export const dotRunner = DotRunner.getInstance();
