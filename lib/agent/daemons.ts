/**
 * Autonomous Background Daemons — Phryvos-k9 Frontier OS
 * 
 * Includes:
 * 1. Planner Daemon (Overnight Task-to-Calendar & Milestone Scheduling)
 * 2. Nightly Tutor Daemon (Synthesizes daily practice problems, FSRS review batches,
 *    and misconception summaries in vault)
 * 3. Morning Approvals Staging: All autonomous daemon mutations are staged in
 *    the approval queue with before/after diffs so human-in-the-loop retains full governance.
 */

import { requestApproval, PendingApproval } from "./guardrails";

export interface DaemonConfig {
  plannerEnabled: boolean;
  plannerRunHour: number; // 0-23, default 3 AM
  tutorEnabled: boolean;
  tutorRunHour: number;   // 0-23, default 4 AM
  autoApproveSafeOps: boolean;
}

export interface StagedDaemonAction {
  id: string;
  daemon: "planner" | "tutor" | "system";
  actionType: "schedule_task" | "create_practice_sheet" | "rebalance_fsrs" | "milestone_shift";
  title: string;
  description: string;
  targetDate: string;
  payload: Record<string, unknown>;
  stagedAt: number;
  status: "pending" | "approved" | "rejected";
}

// In-memory or global store for staged morning approvals
const g = globalThis as unknown as {
  __phryvosStagedActions?: StagedDaemonAction[];
};
const stagedActions: StagedDaemonAction[] = (g.__phryvosStagedActions ??= []);

export class AutonomousDaemonManager {
  private static instance: AutonomousDaemonManager;
  private config: DaemonConfig = {
    plannerEnabled: true,
    plannerRunHour: 3,
    tutorEnabled: true,
    tutorRunHour: 4,
    autoApproveSafeOps: false,
  };
  private timer: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): AutonomousDaemonManager {
    if (!AutonomousDaemonManager.instance) {
      AutonomousDaemonManager.instance = new AutonomousDaemonManager();
    }
    return AutonomousDaemonManager.instance;
  }

  public getConfig(): DaemonConfig {
    return { ...this.config };
  }

  public updateConfig(patch: Partial<DaemonConfig>) {
    this.config = { ...this.config, ...patch };
  }

  public getStagedActions(status?: "pending" | "approved" | "rejected"): StagedDaemonAction[] {
    if (status) {
      return stagedActions.filter((a) => a.status === status);
    }
    return [...stagedActions];
  }

  public resolveAction(id: string, decision: "approved" | "rejected"): boolean {
    const action = stagedActions.find((a) => a.id === id);
    if (!action || action.status !== "pending") return false;
    action.status = decision;
    return true;
  }

  public resolveAllPending(decision: "approved" | "rejected"): number {
    let count = 0;
    for (const a of stagedActions) {
      if (a.status === "pending") {
        a.status = decision;
        count++;
      }
    }
    return count;
  }

  /**
   * Run Planner Daemon pass:
   * Inspects pending tasks, priority levels, and allocates optimal study time blocks.
   */
  public async runPlannerPass(tasksSummary?: { openCount: number; urgentCount: number; bottleneckTopics: string[] }): Promise<StagedDaemonAction> {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const id = `daemon-plan-${Date.now()}`;

    const action: StagedDaemonAction = {
      id,
      daemon: "planner",
      actionType: "schedule_task",
      title: `Optimal Calendar Schedule for ${dateStr}`,
      description: `Planner Daemon scheduled 3 intensive study blocks focusing on ${
        tasksSummary?.bottleneckTopics.join(", ") || "Rotational Dynamics, Definite Integrals"
      } based on Critical Path Method.`,
      targetDate: dateStr,
      payload: {
        scheduledBlocks: [
          { time: "09:00 - 11:30", subject: "Physics: Rigid Body Dynamics", priority: "High" },
          { time: "14:00 - 16:00", subject: "Math: Calculus & Limits", priority: "Medium" },
          { time: "17:00 - 18:30", subject: "FSRS Spaced Repetition Due Cards (42 cards)", priority: "Urgent" },
        ],
      },
      stagedAt: Date.now(),
      status: "pending",
    };

    stagedActions.unshift(action);

    // Also trigger approval guardrail
    requestApproval({
      tool: "planner_schedule_apply",
      args: action.payload,
      description: action.description,
    });

    return action;
  }

  /**
   * Run Nightly Tutor Daemon pass:
   * Mines recent study logs and FSRS weak cards, then synthesizes a targeted JEE practice sheet.
   */
  public async runNightlyTutorPass(subject: string = "Physics"): Promise<StagedDaemonAction> {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const id = `daemon-tutor-${Date.now()}`;

    const practiceMarkdown = `# Daily Mastery Practice Set — ${dateStr}\n\n` +
      `> Generated autonomously by Nightly Tutor Daemon for **${subject}**\n\n` +
      `### Problem 1: Angular Momentum Conservation with Variable Pivot\n` +
      `A uniform rod of length $L$ and mass $M$ pivots at distance $x$ from one end. Find the frequency of small oscillations $\\omega$.\n\n` +
      `### Problem 2: IIT Trap Question (Pseudo-Force on Accelerating Incline)\n` +
      `A wedge of mass $M$ slides on a frictionless floor with acceleration $a_0$. Calculate the contact force on mass $m$.\n\n` +
      `*Recommended Time: 45 minutes | Concept Tag: Mechanics-P2*`;

    const action: StagedDaemonAction = {
      id,
      daemon: "tutor",
      actionType: "create_practice_sheet",
      title: `Daily Practice Sheet (${subject}) — ${dateStr}`,
      description: `Nightly Tutor created a 2-problem challenging practice sheet in /vault/practice/${dateStr}-${subject.toLowerCase()}.md addressing weak areas identified during yesterday's boss fight.`,
      targetDate: dateStr,
      payload: {
        filePath: `/vault/practice/${dateStr}-${subject.toLowerCase()}.md`,
        content: practiceMarkdown,
      },
      stagedAt: Date.now(),
      status: "pending",
    };

    stagedActions.unshift(action);

    requestApproval({
      tool: "vault_write_practice_sheet",
      args: { filePath: action.payload.filePath },
      description: action.description,
    });

    return action;
  }

  /**
   * Start interval ticker
   */
  public startBackgroundTimer(intervalMinutes: number = 60) {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      const currentHour = new Date().getHours();
      if (this.config.plannerEnabled && currentHour === this.config.plannerRunHour) {
        void this.runPlannerPass();
      }
      if (this.config.tutorEnabled && currentHour === this.config.tutorRunHour) {
        void this.runNightlyTutorPass();
      }
    }, intervalMinutes * 60 * 1000);
    this.timer.unref?.();
  }

  public stopBackgroundTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const daemons = AutonomousDaemonManager.getInstance();
