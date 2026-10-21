/**
 * Paperclip Virtual AI Organization & Cost Governance Engine
 * Inspired by paperclipai/paperclip (paperclip-org, paperclip-budget, routines)
 * 
 * Features:
 * 1. Virtual AI Organization Hierarchy: Departments, reporting lines, and role tiers
 * 2. Strict Budgeting & Hard-Stop Cost Controls (auto-lock when tokens/USD hit 100%)
 * 3. Autonomous Daily Standup Routine with executive briefing synthesis
 * 4. Human-In-The-Loop Governance & High-Risk Approval Queue
 */

import { VaultCtx, writeFile, readFile, createDir } from "@/lib/vault-service";

export type Department = "Executive" | "Engineering" | "Research" | "Operations" | "Security";

export type OrgRoleTier = "Executive" | "Lead" | "Specialist" | "Intern";

export interface OrgMember {
  id: string;
  name: string;
  title: string;
  department: Department;
  tier: OrgRoleTier;
  reportsTo?: string; // id of manager
  avatar: string;
  isHardStopped: boolean;
  status: "active" | "hard_stopped" | "standup_pending" | "idle";
}

export interface MemberBudget {
  memberId: string;
  dailyCapUsd: number;
  monthlyCapUsd: number;
  spentTodayUsd: number;
  spentMonthUsd: number;
  tokensUsedToday: number;
  hardStopEnabled: boolean;
  lastResetDay: string; // YYYY-MM-DD
}

export interface StandupEntry {
  memberId: string;
  memberName: string;
  department: Department;
  yesterdayAccomplished: string[];
  todayPlanned: string[];
  blockers: string[];
  submittedAt: number;
}

export interface StandupSession {
  id: string;
  dateStr: string; // YYYY-MM-DD
  executiveBriefing: string;
  entries: StandupEntry[];
  createdAt: number;
}

export interface GovernanceApproval {
  id: string;
  requesterId: string;
  requesterName: string;
  actionType: "bash_exec" | "merge_branch" | "budget_increase" | "delete_vault" | "file_purge";
  payload: Record<string, unknown>;
  reason: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface PaperclipCompanyState {
  companyName: string;
  members: OrgMember[];
  budgets: Record<string, MemberBudget>;
  recentStandups: StandupSession[];
  pendingApprovals: GovernanceApproval[];
  totalSpendMonthUsd: number;
  monthlyCompanyCapUsd: number;
}

// Default initial organization
const DEFAULT_MEMBERS: OrgMember[] = [
  {
    id: "mem-ceo",
    name: "Aura",
    title: "Chief Executive Agent",
    department: "Executive",
    tier: "Executive",
    avatar: "👑",
    isHardStopped: false,
    status: "active",
  },
  {
    id: "mem-eng-lead",
    name: "Forge",
    title: "VP of Engineering & Architecture",
    department: "Engineering",
    tier: "Lead",
    reportsTo: "mem-ceo",
    avatar: "⚡",
    isHardStopped: false,
    status: "active",
  },
  {
    id: "mem-coder",
    name: "Vector",
    title: "Senior Full-Stack Developer",
    department: "Engineering",
    tier: "Specialist",
    reportsTo: "mem-eng-lead",
    avatar: "💻",
    isHardStopped: false,
    status: "active",
  },
  {
    id: "mem-sec-lead",
    name: "Aegis",
    title: "Head of Security & Governance",
    department: "Security",
    tier: "Lead",
    reportsTo: "mem-ceo",
    avatar: "🛡️",
    isHardStopped: false,
    status: "active",
  },
  {
    id: "mem-scout",
    name: "Chronos",
    title: "Lead Research Analyst",
    department: "Research",
    tier: "Specialist",
    reportsTo: "mem-ceo",
    avatar: "🔭",
    isHardStopped: false,
    status: "active",
  },
];

class PaperclipEngine {
  private state: PaperclipCompanyState;

  constructor() {
    const today = new Date().toISOString().slice(0, 10);
    const budgets: Record<string, MemberBudget> = {};

    DEFAULT_MEMBERS.forEach((m) => {
      budgets[m.id] = {
        memberId: m.id,
        dailyCapUsd: m.tier === "Executive" ? 10.0 : m.tier === "Lead" ? 5.0 : 2.5,
        monthlyCapUsd: m.tier === "Executive" ? 200.0 : m.tier === "Lead" ? 100.0 : 50.0,
        spentTodayUsd: 0.15,
        spentMonthUsd: 4.85,
        tokensUsedToday: 35000,
        hardStopEnabled: true,
        lastResetDay: today,
      };
    });

    this.state = {
      companyName: "Phryvos Autonomous Operations",
      members: JSON.parse(JSON.stringify(DEFAULT_MEMBERS)),
      budgets,
      recentStandups: [],
      pendingApprovals: [
        {
          id: "appr-init-1",
          requesterId: "mem-coder",
          requesterName: "Vector",
          actionType: "merge_branch",
          payload: { branch: "agent/auth_flow", target: "main" },
          reason: "Completed encrypted cookie auth pipeline with full test coverage.",
          riskLevel: "medium",
          status: "pending",
          createdAt: Date.now() - 3600000,
        },
      ],
      totalSpendMonthUsd: 14.55,
      monthlyCompanyCapUsd: 350.0,
    };
  }

  /**
   * Retrieves full company organization state
   */
  public getState(): PaperclipCompanyState {
    return this.state;
  }

  /**
   * Records token / USD expenditure for an agent and enforces hard-stops
   */
  public recordExpenditure(memberId: string, tokens: number, estimatedCostUsd: number): {
    hardStopped: boolean;
    remainingDailyUsd: number;
    message: string;
  } {
    const budget = this.state.budgets[memberId];
    if (!budget) {
      return { hardStopped: false, remainingDailyUsd: 999, message: "No budget cap assigned." };
    }

    budget.tokensUsedToday += tokens;
    budget.spentTodayUsd = Math.round((budget.spentTodayUsd + estimatedCostUsd) * 1000) / 1000;
    budget.spentMonthUsd = Math.round((budget.spentMonthUsd + estimatedCostUsd) * 1000) / 1000;
    this.state.totalSpendMonthUsd =
      Math.round((this.state.totalSpendMonthUsd + estimatedCostUsd) * 1000) / 1000;

    const remainingDailyUsd = Math.max(0, budget.dailyCapUsd - budget.spentTodayUsd);

    // Hard Stop Check: 100% of daily or monthly cap reached
    const member = this.state.members.find((m) => m.id === memberId);
    if (
      budget.hardStopEnabled &&
      (budget.spentTodayUsd >= budget.dailyCapUsd || budget.spentMonthUsd >= budget.monthlyCapUsd)
    ) {
      if (member) {
        member.isHardStopped = true;
        member.status = "hard_stopped";
      }
      return {
        hardStopped: true,
        remainingDailyUsd: 0,
        message: `🚨 EMERGENCY HARD-STOP: ${member?.name || memberId} exceeded budget cap ($${budget.spentTodayUsd.toFixed(2)} / $${budget.dailyCapUsd.toFixed(2)}). Agent execution suspended until approval.`,
      };
    }

    return {
      hardStopped: false,
      remainingDailyUsd,
      message: `Expenditure recorded. Remaining daily: $${remainingDailyUsd.toFixed(2)}`,
    };
  }

  /**
   * Updates budget caps or lifts hard stops
   */
  public setBudget(
    memberId: string,
    updates: Partial<MemberBudget>,
  ): MemberBudget {
    let budget = this.state.budgets[memberId];
    if (!budget) {
      budget = {
        memberId,
        dailyCapUsd: 5.0,
        monthlyCapUsd: 100.0,
        spentTodayUsd: 0,
        spentMonthUsd: 0,
        tokensUsedToday: 0,
        hardStopEnabled: true,
        lastResetDay: new Date().toISOString().slice(0, 10),
      };
      this.state.budgets[memberId] = budget;
    }

    Object.assign(budget, updates);

    // If budget lifted, unlock member
    if (budget.spentTodayUsd < budget.dailyCapUsd && budget.spentMonthUsd < budget.monthlyCapUsd) {
      const member = this.state.members.find((m) => m.id === memberId);
      if (member && member.isHardStopped) {
        member.isHardStopped = false;
        member.status = "active";
      }
    }

    return budget;
  }

  /**
   * Executes the Autonomous Daily Standup Routine across all members
   */
  public runStandup(): StandupSession {
    const today = new Date().toISOString().slice(0, 10);
    const entries: StandupEntry[] = this.state.members.map((m) => {
      let yesterday: string[] = [];
      let planned: string[] = [];
      let blockers: string[] = [];

      if (m.department === "Executive") {
        yesterday = ["Reviewed company KPI dashboards", "Allocated sprint budget for security audit"];
        planned = ["Align coworker dots on 16-repo integration mandate", "Review weekly synthesis digest"];
      } else if (m.department === "Engineering") {
        if (m.tier === "Lead") {
          yesterday = ["Reviewed Git worktree PRs in Orca fleet", "Approved DigUp hybrid RRF indexing architecture"];
          planned = ["Enforce AST security linting and zero-leak memory boundary", "Review swarm consensus benchmarks"];
        } else {
          yesterday = ["Implemented Reciprocal Rank Fusion damping (K=60)", "Configured 3-way worktree diff viewer"];
          planned = ["Add automated conflict resolution heuristics", "Refactor SQLite FTS5 chunk indexer"];
        }
      } else if (m.department === "Security") {
        yesterday = ["Audited agent bash execution sandbox", "Verified zero plaintext key leaks in metadata tables"];
        planned = ["Inspect Telegram bot token rotation policy", "Review pending governance approval queue"];
      } else if (m.department === "Research") {
        yesterday = ["Benchmarked HuggingFace and Pollinations frontier models", "Extracted technical docs via Jina Reader"];
        planned = ["Survey iFixAi AST security patterns", "Test Hermes tool synthesis reflection mechanisms"];
      }

      return {
        memberId: m.id,
        memberName: m.name,
        department: m.department,
        yesterdayAccomplished: yesterday,
        todayPlanned: planned,
        blockers,
        submittedAt: Date.now(),
      };
    });

    const executiveBriefing = `Executive Briefing (${today}): All 5 operational units report green health. Zero blockers reported across Engineering, Security, and Research. Total month spend: $${this.state.totalSpendMonthUsd.toFixed(2)} (well within $${this.state.monthlyCompanyCapUsd.toFixed(2)} cap).`;

    const session: StandupSession = {
      id: `standup-${today}-${Date.now()}`,
      dateStr: today,
      executiveBriefing,
      entries,
      createdAt: Date.now(),
    };

    this.state.recentStandups.unshift(session);
    if (this.state.recentStandups.length > 30) {
      this.state.recentStandups.pop();
    }

    return session;
  }

  /**
   * Requests a human-in-the-loop governance approval
   */
  public requestApproval(
    requesterId: string,
    actionType: GovernanceApproval["actionType"],
    reason: string,
    payload: Record<string, unknown> = {},
    riskLevel: GovernanceApproval["riskLevel"] = "medium",
  ): GovernanceApproval {
    const requester = this.state.members.find((m) => m.id === requesterId);
    const item: GovernanceApproval = {
      id: `gov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      requesterId,
      requesterName: requester?.name || requesterId,
      actionType,
      payload,
      reason,
      riskLevel,
      status: "pending",
      createdAt: Date.now(),
    };

    this.state.pendingApprovals.unshift(item);
    return item;
  }

  /**
   * Resolves a pending governance approval (approve or reject)
   */
  public resolveApproval(
    id: string,
    decision: "approved" | "rejected",
    resolvedBy = "Human Supervisor",
  ): { success: boolean; approval: GovernanceApproval | null; message: string } {
    const item = this.state.pendingApprovals.find((a) => a.id === id);
    if (!item) {
      return { success: false, approval: null, message: "Approval request not found." };
    }

    item.status = decision;
    item.resolvedAt = Date.now();
    item.resolvedBy = resolvedBy;

    return {
      success: true,
      approval: item,
      message: `Action ${decision.toUpperCase()} by ${resolvedBy}: "${item.reason}"`,
    };
  }
}

export const paperclipEngine = new PaperclipEngine();
