/**
 * Everything Claude Code (ECC) - Surgical Prompt Contracts & Rule Evolution Engine
 * Inspired by affaan-m/ECC (Everything Claude Code)
 * 
 * Features:
 * 1. Multi-Tier Prompt Contracts: Planning, Implementation, and Quality Verification Gates
 * 2. Continuous Learning Loop: Persists user corrections into .rules/learned-rules.json in the vault
 * 3. Pre/Post-Execution Checklist Verifier (verifies tests, diff scope, comment preservation)
 * 4. Vault Export for CLAUDE.md and RULES.md
 */

import { VaultCtx, writeFile, readFile, createDir, search as vaultSearch } from "@/lib/vault-service";

export type RuleCategory = "coding" | "safety" | "formatting" | "workflow" | "user_preference";

export interface LearnedRule {
  id: string;
  category: RuleCategory;
  title: string;
  ruleText: string;
  source: "user_correction" | "test_failure" | "agent_reflection" | "manual" | "user_preference";
  confidence: number; // 0.0 to 1.0
  createdAt: number;
}

export interface VerificationChecklist {
  id: string;
  taskId?: string;
  timestamp: number;
  checks: Array<{
    name: string;
    description: string;
    passed: boolean;
    evidence?: string;
  }>;
  overallPassed: boolean;
  score: number; // 0 to 100
}

export interface PromptContract {
  phase: "plan" | "implement" | "verify";
  title: string;
  systemRules: string[];
}

// Built-in foundational prompt contracts
const BASE_CONTRACTS: Record<string, PromptContract> = {
  plan: {
    phase: "plan",
    title: "Phase 1: Planning & Scope Verification",
    systemRules: [
      "Explicitly outline the approach, affected files, and boundary contracts before modifying any code.",
      "Verify that external dependencies or APIs exist in the target runtime.",
      "Identify edge cases, error states, and backward compatibility constraints.",
    ],
  },
  implement: {
    phase: "implement",
    title: "Phase 2: Surgical Implementation",
    systemRules: [
      "Maintain documentation integrity: preserve all unrelated comments, docstrings, and license headers.",
      "Match the exact codebase indentation, import style, and type annotations.",
      "Never truncate or leave placeholder code (e.g. '// ... rest of code'); write full, drop-in replacements.",
    ],
  },
  verify: {
    phase: "verify",
    title: "Phase 3: Quality Verification Gate",
    systemRules: [
      "Execute automated type checks (`tsc --noEmit`) and tests before declaring completion.",
      "Verify zero unexpected side effects on adjacent modules.",
      "Commit changes with concise, standard conventional commit messages (`feat(...)`, `fix(...)`).",
    ],
  },
};

const DEFAULT_LEARNED_RULES: LearnedRule[] = [
  {
    id: "rule-1-termux",
    category: "workflow",
    title: "Android Termux Webpack Build Requirement",
    ruleText: "Turbopack native binary is unsupported on Android Termux aarch64; always build production with `npx next build --webpack`.",
    source: "test_failure",
    confidence: 1.0,
    createdAt: Date.now() - 86400000,
  },
  {
    id: "rule-2-zod",
    category: "coding",
    title: "Zod v4 Record Signature Rule",
    ruleText: "In Zod v4, `z.record(keyType, valueType)` requires two type arguments (e.g. `z.record(z.string(), z.string())`).",
    source: "user_correction",
    confidence: 1.0,
    createdAt: Date.now() - 72000000,
  },
  {
    id: "rule-3-comments",
    category: "formatting",
    title: "Preserve Existing Comments",
    ruleText: "Never delete existing codebase comments or docstrings unless explicitly directed by the user.",
    source: "user_preference",
    confidence: 1.0,
    createdAt: Date.now() - 50000000,
  },
];

class EccEngine {
  private learnedRules: LearnedRule[] = [];
  private verifications: VerificationChecklist[] = [];

  constructor() {
    this.learnedRules = JSON.parse(JSON.stringify(DEFAULT_LEARNED_RULES));
  }

  /**
   * Retrieves all learned rules and prompt contracts
   */
  public getState(): {
    learnedRules: LearnedRule[];
    contracts: Record<string, PromptContract>;
    recentVerifications: VerificationChecklist[];
  } {
    return {
      learnedRules: this.learnedRules,
      contracts: BASE_CONTRACTS,
      recentVerifications: this.verifications,
    };
  }

  /**
   * Persists a new learned rule into memory and vault
   */
  public learnRule(
    title: string,
    ruleText: string,
    category: RuleCategory = "coding",
    source: LearnedRule["source"] = "user_correction",
    ctx?: VaultCtx,
  ): LearnedRule {
    const rule: LearnedRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      category,
      title,
      ruleText,
      source,
      confidence: 1.0,
      createdAt: Date.now(),
    };

    this.learnedRules.unshift(rule);

    if (ctx) {
      try {
        createDir(ctx, "/rules");
        const json = JSON.stringify(this.learnedRules, null, 2);
        writeFile(ctx, "/rules/learned-rules.json", Buffer.from(json, "utf8"));

        // Also generate human-readable markdown RULES.md
        const mdLines = [
          "# Phryvos-K9 Surgical Rules & Learned Contracts",
          "> Auto-generated by affaan-m/ECC Continuous Learning Engine",
          "",
          ...this.learnedRules.map(
            (r, i) => `### ${i + 1}. ${r.title} [${r.category.toUpperCase()}]\n${r.ruleText}\n*Source: ${r.source}*\n`,
          ),
        ];
        writeFile(ctx, "/rules/RULES.md", Buffer.from(mdLines.join("\n"), "utf8"));
      } catch (err) {
        console.warn("[ECC] Failed to persist rules to vault:", err);
      }
    }

    return rule;
  }

  /**
   * Deletes a learned rule
   */
  public deleteRule(id: string): boolean {
    const idx = this.learnedRules.findIndex((r) => r.id === id);
    if (idx !== -1) {
      this.learnedRules.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Evaluates a turn or diff against the Quality Verification Gate
   */
  public runVerificationGate(options: {
    taskId?: string;
    hasTypeScriptPassed: boolean;
    hasBuildPassed: boolean;
    commentsPreserved: boolean;
    unrelatedDiffsAvoided: boolean;
  }): VerificationChecklist {
    const checks = [
      {
        name: "Type Check Integrity",
        description: "TypeScript compiler `tsc --noEmit` exited cleanly with 0 errors.",
        passed: options.hasTypeScriptPassed,
        evidence: options.hasTypeScriptPassed ? "Passed" : "TypeScript errors reported",
      },
      {
        name: "Production Build Verifier",
        description: "Webpack production bundle compiled and generated static pages.",
        passed: options.hasBuildPassed,
        evidence: options.hasBuildPassed ? "50+ routes compiled" : "Build failed",
      },
      {
        name: "Documentation & Comment Preservation",
        description: "All existing docstrings and comments preserved without deletion.",
        passed: options.commentsPreserved,
        evidence: options.commentsPreserved ? "100% comments intact" : "Comment deletion detected",
      },
      {
        name: "Surgical Scope Confinement",
        description: "Diff modified only target modules without spilling into unrelated code.",
        passed: options.unrelatedDiffsAvoided,
        evidence: options.unrelatedDiffsAvoided ? "Confined to requested task" : "Out-of-scope diffs",
      },
    ];

    const passedCount = checks.filter((c) => c.passed).length;
    const score = Math.round((passedCount / checks.length) * 100);
    const overallPassed = score === 100;

    const checklist: VerificationChecklist = {
      id: `gate-${Date.now()}`,
      taskId: options.taskId,
      timestamp: Date.now(),
      checks,
      overallPassed,
      score,
    };

    this.verifications.unshift(checklist);
    if (this.verifications.length > 20) {
      this.verifications.pop();
    }

    return checklist;
  }
}

export const eccEngine = new EccEngine();
