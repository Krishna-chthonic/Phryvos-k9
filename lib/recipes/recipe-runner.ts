/**
 * Goose Automation Recipe Engine for Phryvos-K9
 * Inspired by aaif-goose/goose (formerly block/goose)
 * 
 * Provides:
 * 1. Declarative multi-step developer automation recipes (JSON/YAML)
 * 2. Parameter substitution and step dependency sequencing
 * 3. Step-by-step execution through agent loop with audit tracing
 * 4. Vault-persisted custom recipes (/recipes/<id>.json)
 * 5. Telegram push alert & remote slash command (/recipe <id>)
 */

import { createFile, writeFile, readFile, getMeta, listDir, search, deleteFile, type VaultCtx } from "@/lib/vault-service";
import { defaultProvider, createLlmClient } from "@/lib/providers-service";
import { runAgentTurn } from "@/lib/agent/loop";
import { ensureAgentTools } from "@/lib/agent/tools";
import { telegramGateway } from "@/lib/gateway/telegram-gateway";
import { recordAuditStep } from "@/lib/plugins/audit-tracer";
import type { UnifiedMessage } from "@/lib/ai/types";

export interface RecipeParam {
  name: string;
  description: string;
  default: string;
  required?: boolean;
}

export interface RecipeStep {
  name: string;
  prompt: string;
  allowedTools?: string[];
  onFailure?: "abort" | "continue";
}

export interface RecipeSpec {
  id: string;
  name: string;
  description: string;
  category: "quality" | "security" | "devops" | "docs" | "general";
  parameters: RecipeParam[];
  steps: RecipeStep[];
  author?: string;
  isBuiltin?: boolean;
}

export interface RecipeStepExecution {
  stepIndex: number;
  stepName: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  output?: string;
  durationMs?: number;
  error?: string;
}

export interface RecipeExecutionResult {
  recipeId: string;
  recipeName: string;
  status: "completed" | "failed";
  stepResults: RecipeStepExecution[];
  finalReport: string;
  totalDurationMs: number;
}

export const BUILTIN_RECIPES: RecipeSpec[] = [
  {
    id: "code-review",
    name: "Deep Code Review & Git Diff Audit",
    description: "Surgically inspects altered git diffs for logical bugs, security flaws, type safety, and architectural regressions.",
    category: "quality",
    parameters: [
      { name: "targetBranch", description: "Base branch or commit to diff against", default: "main" },
      { name: "strictness", description: "Review strictness (high, medium, paranoid)", default: "high" },
    ],
    steps: [
      {
        name: "Diff & Status Inspection",
        prompt: "Run `git status` and inspect current modifications. Identify altered files and summarize the change scope.",
      },
      {
        name: "Surgical Code Quality & Security Check",
        prompt: "Review the modified files thoroughly. Check for unhandled exceptions, type mismatches, security vulnerabilities, or performance bottlenecks.",
      },
      {
        name: "Generate Structured Review Dossier",
        prompt: "Synthesize findings into an actionable markdown report with sections: Summary, Identified Risks, Surgical Recommendations, and Verdict.",
      },
    ],
    author: "Goose / AAIF",
    isBuiltin: true,
  },
  {
    id: "security-audit",
    name: "Secret Scanner & PII Vulnerability Audit",
    description: "Deeply scans workspace and recent files for exposed private keys, unmasked tokens, shell bomb patterns, and safety flaws.",
    category: "security",
    parameters: [
      { name: "targetPath", description: "Directory or file path to audit", default: "." },
    ],
    steps: [
      {
        name: "Secret & Credential Scan",
        prompt: "Inspect files in {{targetPath}} for hardcoded API keys, private tokens, passwords, or unmasked PII.",
      },
      {
        name: "Shell Command & Path Traversal Verification",
        prompt: "Verify that dangerous commands (fork bombs, `rm -rf /`, curl-piping) and unsafe path traversal sequences are properly blocked by safety linters.",
      },
      {
        name: "Compile Security Certification",
        prompt: "Generate a Security Audit Certificate in markdown detailing scanned vectors, flagged risks, and remediation status.",
      },
    ],
    author: "Block / AAIF",
    isBuiltin: true,
  },
  {
    id: "test-and-fix",
    name: "Autonomous Test, Diagnose & Surgical Fix",
    description: "Executes test/build suites, extracts root-cause failure traces, applies minimal targeted fixes, and re-verifies.",
    category: "quality",
    parameters: [
      { name: "testCommand", description: "Test command to execute", default: "npm run test" },
      { name: "maxRetries", description: "Maximum repair loops allowed", default: "2" },
    ],
    steps: [
      {
        name: "Initial Test Execution",
        prompt: "Run {{testCommand}} in the workspace. Observe and capture all failure output or compilation errors.",
      },
      {
        name: "Root-Cause Diagnosis",
        prompt: "Analyze the failure traces. Inspect the exact source files and line numbers responsible for the errors.",
      },
      {
        name: "Surgical Fix & Re-Verification",
        prompt: "Apply minimal, surgical fixes to the root cause without altering unrelated code. Re-run {{testCommand}} to verify clean passage.",
      },
    ],
    author: "Goose / AAIF",
    isBuiltin: true,
  },
  {
    id: "docs-sync",
    name: "Git Commits & Documentation Sync",
    description: "Analyzes recent git commits and pulls, verifies accuracy of project documentation, and updates docs/guides.",
    category: "docs",
    parameters: [
      { name: "commitCount", description: "Number of recent commits to analyze", default: "5" },
    ],
    steps: [
      {
        name: "Git Commit Log Inspection",
        prompt: "Run `git log -n {{commitCount}} --oneline` and check modified files to map out what features or bugfixes were added.",
      },
      {
        name: "Documentation Gap Analysis",
        prompt: "Compare recent additions against existing documentation files in the vault. Identify undocumented features, tools, or configuration options.",
      },
      {
        name: "Update Documentation",
        prompt: "Update relevant markdown documentation files with concise, high-value explanations of newly introduced features.",
      },
    ],
    author: "Goose / AAIF",
    isBuiltin: true,
  },
  {
    id: "backup-verify",
    name: "Vault Integrity & Snapshot Verification",
    description: "Validates SQLite database page integrity, checks foreign key constraints, and verifies encrypted snapshot state.",
    category: "devops",
    parameters: [],
    steps: [
      {
        name: "SQLite PRAGMA Integrity Check",
        prompt: "Run `PRAGMA integrity_check` on the database and inspect file table consistency.",
      },
      {
        name: "Verification Summary",
        prompt: "Verify that all vault file metadata match physical blobs and report overall storage health.",
      },
    ],
    author: "Phryvos",
    isBuiltin: true,
  },
];

/**
 * Lists all recipes (built-in + vault-persisted custom recipes)
 */
export function listRecipes(ctx: VaultCtx): RecipeSpec[] {
  const result: RecipeSpec[] = [...BUILTIN_RECIPES];

  try {
    const hits = search(ctx, "recipes/");
    for (const hit of hits) {
      if (hit.isDir || !hit.path.endsWith(".json")) continue;
      const meta = getMeta(ctx, hit.path);
      if (!meta || meta.deletedAt) continue;

      try {
        const text = readFile(ctx, hit.path).bytes.toString("utf8");
        const parsed = JSON.parse(text) as RecipeSpec;
        if (parsed.id && parsed.name && Array.isArray(parsed.steps)) {
          result.push({ ...parsed, isBuiltin: false });
        }
      } catch {}
    }
  } catch {}

  return result;
}

/**
 * Gets a specific recipe by ID
 */
export function getRecipe(ctx: VaultCtx, recipeId: string): RecipeSpec | undefined {
  return listRecipes(ctx).find((r) => r.id === recipeId);
}

/**
 * Saves a custom recipe to the vault
 */
export function saveRecipe(ctx: VaultCtx, recipe: Omit<RecipeSpec, "isBuiltin">): RecipeSpec {
  const cleanId = recipe.id.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const vaultPath = `/recipes/${cleanId}.json`;

  const existing = getMeta(ctx, vaultPath);
  if (!existing || existing.deletedAt) {
    createFile(ctx, vaultPath);
  }

  const spec: RecipeSpec = {
    ...recipe,
    id: cleanId,
    isBuiltin: false,
  };

  writeFile(ctx, vaultPath, JSON.stringify(spec, null, 2));
  return spec;
}

/**
 * Deletes a custom recipe from the vault
 */
export function deleteCustomRecipe(ctx: VaultCtx, recipeId: string): boolean {
  const vaultPath = `/recipes/${recipeId}.json`;
  const existing = getMeta(ctx, vaultPath);
  if (!existing || existing.deletedAt) return false;
  deleteFile(ctx, vaultPath);
  return true;
}

/**
 * Interpolates parameter values into a step prompt
 */
function interpolatePrompt(prompt: string, params: Record<string, string>): string {
  let result = prompt;
  for (const [key, val] of Object.entries(params)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), val);
  }
  result = result.replace(/{{timestamp}}/g, new Date().toISOString());
  return result;
}

/**
 * Executes a Goose automation recipe step by step
 */
export async function executeRecipe(
  ctx: VaultCtx,
  recipeId: string,
  userParams: Record<string, string> = {},
  onStepUpdate?: (stepResult: RecipeStepExecution) => void,
): Promise<RecipeExecutionResult> {
  const recipe = getRecipe(ctx, recipeId);
  if (!recipe) {
    throw new Error(`Recipe "${recipeId}" not found.`);
  }

  ensureAgentTools();

  // Resolve parameters with defaults
  const params: Record<string, string> = {};
  for (const p of recipe.parameters) {
    params[p.name] = userParams[p.name] ?? p.default;
  }

  const provider = defaultProvider(ctx);
  if (!provider) {
    throw new Error("No active AI provider configured in Settings.");
  }

  const client = createLlmClient(ctx, provider.id);
  const model = provider.models[0] || "default";

  const startTime = Date.now();
  const stepResults: RecipeStepExecution[] = [];
  let overallStatus: "completed" | "failed" = "completed";
  let accumulatedOutputs = "";

  recordAuditStep({
    stepNumber: 0,
    phase: "prompt",
    thinkingSnippet: `Starting Goose Recipe: "${recipe.name}" (${recipe.steps.length} steps)`,
  });

  for (let idx = 0; idx < recipe.steps.length; idx++) {
    const step = recipe.steps[idx];
    const stepStartTime = Date.now();
    const interpolated = interpolatePrompt(step.prompt, params);

    const stepExec: RecipeStepExecution = {
      stepIndex: idx + 1,
      stepName: step.name,
      status: "running",
    };
    onStepUpdate?.(stepExec);

    try {
      const messages: UnifiedMessage[] = [
        {
          role: "system",
          content: `You are executing Step ${idx + 1}/${recipe.steps.length} of the Goose Automation Recipe: "${recipe.name}".
Goal: ${step.name}
Execute required tools surgically, observe outcomes, and provide a clear, concise summary of your actions and discoveries.`,
        },
        {
          role: "user",
          content: interpolated,
        },
      ];

      const turnResult = await runAgentTurn({
        db: ctx.db,
        key: ctx.key,
        client,
        model,
        initialMessages: messages,
        maxSteps: 6,
        autoApproveTools: true, // Recipes run autonomously
        providerTimeoutMs: 90_000,
        onDelta: () => {},
        onStep: () => {},
        onApprovalRequest: () => {},
        appendAssistant: () => {},
        appendTool: () => {},
      });

      const stepDuration = Date.now() - stepStartTime;
      const stepSummary = turnResult.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || "Step completed.";

      stepExec.status = "completed";
      stepExec.output = stepSummary;
      stepExec.durationMs = stepDuration;
      stepResults.push(stepExec);
      accumulatedOutputs += `### Step ${idx + 1}: ${step.name}\n\n${stepSummary}\n\n`;

      onStepUpdate?.(stepExec);
    } catch (err) {
      const stepDuration = Date.now() - stepStartTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      stepExec.status = "failed";
      stepExec.error = errorMsg;
      stepExec.durationMs = stepDuration;
      stepResults.push(stepExec);

      onStepUpdate?.(stepExec);

      if (step.onFailure === "abort" || !step.onFailure) {
        overallStatus = "failed";
        accumulatedOutputs += `### Step ${idx + 1}: ${step.name} (FAILED)\n\nError: ${errorMsg}\n\n`;
        break;
      }
    }
  }

  const totalDurationMs = Date.now() - startTime;

  // Telegram alert
  const emoji = overallStatus === "completed" ? "✔" : "❌";
  void telegramGateway.broadcast(
    ctx.db,
    `${emoji} *Goose Recipe ${overallStatus.toUpperCase()}: ${recipe.name}*\n⏱ Completed in ${(totalDurationMs / 1000).toFixed(1)}s\n\n${stepResults.map((s) => `• ${s.stepName}: ${s.status}`).join("\n")}`,
  );

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    status: overallStatus,
    stepResults,
    finalReport: accumulatedOutputs.trim(),
    totalDurationMs,
  };
}
