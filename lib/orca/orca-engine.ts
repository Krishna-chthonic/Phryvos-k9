/**
 * StablyAI Orca - Multi-Agent Worktree Fleet Orchestrator & Merge Engine
 * Inspired by stablyai/orca (Agent Development Environment)
 * 
 * Provides:
 * 1. Fleet-wide git worktree isolation for concurrent AI coding agents
 * 2. 3-Way diff computation between agent branches and base (main)
 * 3. Dry-run merge conflict detection using git merge-tree simulation
 * 4. Automated conflict analysis & resolution recommendations
 * 5. Atomic merge with automated commit synthesis and worktree pruning
 */

import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import util from "node:util";

const execAsync = util.promisify(exec);

export interface FleetWorktree {
  id: string;
  name: string;
  worktreePath: string;
  branch: string;
  baseBranch: string;
  headCommit: string;
  isClean: boolean;
  uncommittedFiles: string[];
  commitsAhead: number;
  commitsBehind: number;
  diffSummary?: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  mergeability: "CLEAN" | "CONFLICT" | "DIRTY" | "UP_TO_DATE";
  conflictingFiles?: string[];
  updatedAt: number;
}

export interface WorktreeDiffFile {
  filePath: string;
  status: "added" | "deleted" | "modified" | "renamed";
  insertions: number;
  deletions: number;
  patch: string;
}

export interface DryRunMergeResult {
  canMergeCleanly: boolean;
  baseBranch: string;
  targetBranch: string;
  mergeBaseCommit: string;
  conflictingFiles: string[];
  conflictCount: number;
  stdoutSnippet: string;
  recommendedResolution?: string;
}

const REPO_ROOT = process.cwd();
const ORCA_WORKTREE_DIR = path.join(REPO_ROOT, ".phryvos", "worktrees");

function ensureBaseDir(): void {
  if (!fs.existsSync(ORCA_WORKTREE_DIR)) {
    fs.mkdirSync(ORCA_WORKTREE_DIR, { recursive: true });
  }
}

export function sanitizeBranchSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/^_+|_+$/g, "") || "orca_worktree";
}

/**
 * Lists all active git worktrees across the repository and gathers fleet telemetry
 */
export async function getOrcaFleet(baseBranch = "main"): Promise<FleetWorktree[]> {
  ensureBaseDir();
  const fleet: FleetWorktree[] = [];

  try {
    const { stdout } = await execAsync("git worktree list --porcelain", { cwd: REPO_ROOT });
    const lines = stdout.split("\n");
    const trees: Array<{ path: string; head: string; branch: string }> = [];
    let current: Partial<{ path: string; head: string; branch: string }> = {};

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        if (current.path) trees.push(current as { path: string; head: string; branch: string });
        current = { path: line.substring(9).trim() };
      } else if (line.startsWith("HEAD ")) {
        current.head = line.substring(5).trim();
      } else if (line.startsWith("branch ")) {
        current.branch = line.substring(7).replace("refs/heads/", "").trim();
      } else if (line === "") {
        if (current.path) {
          trees.push(current as { path: string; head: string; branch: string });
          current = {};
        }
      }
    }
    if (current.path) trees.push(current as { path: string; head: string; branch: string });

    // Inspect each worktree (excluding root repo itself)
    for (const t of trees) {
      if (path.resolve(t.path) === path.resolve(REPO_ROOT)) continue;

      const name = path.basename(t.path);
      const branch = t.branch || `branch-${name}`;

      // 1. Status & Dirty check
      let isClean = true;
      let uncommittedFiles: string[] = [];
      try {
        const { stdout: statusOut } = await execAsync("git status --porcelain", { cwd: t.path });
        const sLines = statusOut.trim() ? statusOut.trim().split("\n") : [];
        isClean = sLines.length === 0;
        uncommittedFiles = sLines.map((l) => l.substring(3).trim());
      } catch {}

      // 2. Ahead / Behind metrics
      let commitsAhead = 0;
      let commitsBehind = 0;
      try {
        const { stdout: revCount } = await execAsync(
          `git rev-list --left-right --count ${baseBranch}...${branch}`,
          { cwd: REPO_ROOT },
        );
        const [behind, ahead] = revCount.trim().split(/\s+/).map(Number);
        commitsBehind = behind || 0;
        commitsAhead = ahead || 0;
      } catch {}

      // 3. Diff Summary (insertions, deletions)
      let diffSummary = { filesChanged: 0, insertions: 0, deletions: 0 };
      try {
        const { stdout: diffStat } = await execAsync(
          `git diff --shortstat ${baseBranch}...${branch}`,
          { cwd: REPO_ROOT },
        );
        const match = diffStat.match(/(\d+)\s+file.*?(?:(\d+)\s+insertion)?.*?(?:(\d+)\s+deletion)?/);
        if (match) {
          diffSummary = {
            filesChanged: Number(match[1] || 0),
            insertions: Number(match[2] || 0),
            deletions: Number(match[3] || 0),
          };
        }
      } catch {}

      // 4. Mergeability Classification
      let mergeability: FleetWorktree["mergeability"] = "CLEAN";
      let conflictingFiles: string[] = [];

      if (!isClean) {
        mergeability = "DIRTY";
      } else if (commitsAhead === 0 && commitsBehind === 0) {
        mergeability = "UP_TO_DATE";
      } else {
        // Fast dry-run conflict check
        try {
          const { stdout: baseSha } = await execAsync(`git merge-base ${baseBranch} ${branch}`, {
            cwd: REPO_ROOT,
          });
          const { stdout: treeOut } = await execAsync(
            `git merge-tree ${baseSha.trim()} ${baseBranch} ${branch}`,
            { cwd: REPO_ROOT },
          );
          if (treeOut.includes("<<<<<<<") || treeOut.includes("merged with conflict")) {
            mergeability = "CONFLICT";
            // extract conflict filenames
            const fileMatches = treeOut.match(/changed in both\s+([^\s]+)/g) || [];
            conflictingFiles = fileMatches.map((m) => m.replace("changed in both", "").trim());
          }
        } catch {
          // fallback
        }
      }

      fleet.push({
        id: `orca-${name}`,
        name,
        worktreePath: t.path,
        branch,
        baseBranch,
        headCommit: (t.head || "").substring(0, 7),
        isClean,
        uncommittedFiles,
        commitsAhead,
        commitsBehind,
        diffSummary,
        mergeability,
        conflictingFiles,
        updatedAt: Date.now(),
      });
    }

    return fleet;
  } catch (err) {
    console.error("[OrcaEngine] Failed to get fleet:", err);
    return [];
  }
}

/**
 * Creates a new isolated worktree for an agent or task
 */
export async function createOrcaWorktree(
  name: string,
  baseBranch = "main",
): Promise<{ success: boolean; worktree: FleetWorktree | null; message: string }> {
  ensureBaseDir();
  const slug = sanitizeBranchSlug(name);
  const worktreePath = path.join(ORCA_WORKTREE_DIR, slug);
  const branch = `agent/${slug}`;

  try {
    if (fs.existsSync(worktreePath)) {
      return { success: false, worktree: null, message: `Worktree directory already exists at ${worktreePath}` };
    }

    // Check if branch exists
    let branchExists = false;
    try {
      await execAsync(`git show-ref --verify --quiet refs/heads/${branch}`, { cwd: REPO_ROOT });
      branchExists = true;
    } catch {}

    if (branchExists) {
      await execAsync(`git worktree add "${worktreePath}" "${branch}"`, { cwd: REPO_ROOT });
    } else {
      await execAsync(`git worktree add -b "${branch}" "${worktreePath}" "${baseBranch}"`, {
        cwd: REPO_ROOT,
      });
    }

    const fleet = await getOrcaFleet(baseBranch);
    const created = fleet.find((w) => w.name === slug) || null;

    return {
      success: true,
      worktree: created,
      message: `Created isolated worktree at ${worktreePath} on branch ${branch}`,
    };
  } catch (err) {
    return {
      success: false,
      worktree: null,
      message: `Failed to create worktree: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Computes 3-way structured git diff between worktree branch and base branch
 */
export async function getOrcaWorktreeDiff(
  worktreeName: string,
  baseBranch = "main",
): Promise<{
  worktreeName: string;
  files: WorktreeDiffFile[];
  summary: { filesChanged: number; insertions: number; deletions: number };
}> {
  const slug = sanitizeBranchSlug(worktreeName);
  const branch = `agent/${slug}`;

  try {
    const { stdout: numstat } = await execAsync(
      `git diff --numstat ${baseBranch}...${branch}`,
      { cwd: REPO_ROOT },
    );

    const files: WorktreeDiffFile[] = [];
    const lines = numstat.trim() ? numstat.trim().split("\n") : [];

    let totalIns = 0;
    let totalDel = 0;

    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const ins = parts[0] === "-" ? 0 : Number(parts[0]) || 0;
      const del = parts[1] === "-" ? 0 : Number(parts[1]) || 0;
      const filePath = parts[2];

      totalIns += ins;
      totalDel += del;

      let patch = "";
      try {
        const { stdout: pOut } = await execAsync(
          `git diff -U3 ${baseBranch}...${branch} -- "${filePath}"`,
          { cwd: REPO_ROOT },
        );
        patch = pOut.slice(0, 3000);
      } catch {}

      files.push({
        filePath,
        status: ins > 0 && del === 0 ? "added" : ins === 0 && del > 0 ? "deleted" : "modified",
        insertions: ins,
        deletions: del,
        patch,
      });
    }

    return {
      worktreeName,
      files,
      summary: {
        filesChanged: files.length,
        insertions: totalIns,
        deletions: totalDel,
      },
    };
  } catch (err) {
    console.error("[OrcaEngine] Diff error:", err);
    return {
      worktreeName,
      files: [],
      summary: { filesChanged: 0, insertions: 0, deletions: 0 },
    };
  }
}

/**
 * Executes an automated dry-run merge check between an agent worktree and base
 */
export async function dryRunOrcaMerge(
  worktreeName: string,
  baseBranch = "main",
): Promise<DryRunMergeResult> {
  const slug = sanitizeBranchSlug(worktreeName);
  const branch = `agent/${slug}`;

  try {
    const { stdout: baseSha } = await execAsync(`git merge-base ${baseBranch} ${branch}`, {
      cwd: REPO_ROOT,
    });
    const mergeBaseCommit = baseSha.trim().substring(0, 7);

    const { stdout: treeOut } = await execAsync(
      `git merge-tree ${mergeBaseCommit} ${baseBranch} ${branch}`,
      { cwd: REPO_ROOT },
    );

    const hasConflict = treeOut.includes("<<<<<<<") || treeOut.includes("merged with conflict");
    const conflictingFiles: string[] = [];

    if (hasConflict) {
      const lines = treeOut.split("\n");
      for (const l of lines) {
        if (l.includes("changed in both")) {
          const match = l.match(/changed in both\s+([^\s]+)/);
          if (match && match[1]) conflictingFiles.push(match[1]);
        }
      }
    }

    let recommendedResolution: string | undefined;
    if (hasConflict) {
      recommendedResolution =
        "Conflict detected in shared files. Recommended: rebase agent branch against latest main or use AST-level 3-way union.";
    } else {
      recommendedResolution = "Clean merge possible. Safe to execute atomic fast-forward or no-ff merge.";
    }

    return {
      canMergeCleanly: !hasConflict,
      baseBranch,
      targetBranch: branch,
      mergeBaseCommit,
      conflictingFiles: Array.from(new Set(conflictingFiles)),
      conflictCount: conflictingFiles.length,
      stdoutSnippet: treeOut.slice(0, 1000),
      recommendedResolution,
    };
  } catch (err) {
    return {
      canMergeCleanly: false,
      baseBranch,
      targetBranch: branch,
      mergeBaseCommit: "unknown",
      conflictingFiles: [],
      conflictCount: 0,
      stdoutSnippet: String(err),
      recommendedResolution: "Git merge-tree inspection failed. Check branch existence.",
    };
  }
}

/**
 * Atomically merges an agent worktree into baseBranch and cleans up
 */
export async function mergeAndPruneOrcaWorktree(
  worktreeName: string,
  baseBranch = "main",
  options?: { squash?: boolean; customCommitMsg?: string; prune?: boolean },
): Promise<{ success: boolean; message: string }> {
  const slug = sanitizeBranchSlug(worktreeName);
  const branch = `agent/${slug}`;
  const worktreePath = path.join(ORCA_WORKTREE_DIR, slug);

  try {
    // 1. Commit any uncommitted changes in worktree
    if (fs.existsSync(worktreePath)) {
      const { stdout: st } = await execAsync("git status --porcelain", { cwd: worktreePath });
      if (st.trim()) {
        await execAsync('git add -A && git commit -m "chore(orca): auto checkpoint before merge"', {
          cwd: worktreePath,
        });
      }
    }

    // 2. Perform dry-run first
    const dryRun = await dryRunOrcaMerge(worktreeName, baseBranch);
    if (!dryRun.canMergeCleanly) {
      return {
        success: false,
        message: `Merge rejected: ${dryRun.conflictCount} conflict(s) detected in ${dryRun.conflictingFiles.join(", ")}. Resolve conflicts before merging.`,
      };
    }

    // 3. Checkout baseBranch and merge
    const commitMsg =
      options?.customCommitMsg || `feat(fleet): merge agent worktree ${branch} into ${baseBranch}`;
    const mergeFlag = options?.squash ? "--squash" : "--no-ff";

    await execAsync(`git checkout ${baseBranch} && git merge ${mergeFlag} "${branch}" -m "${commitMsg}"`, {
      cwd: REPO_ROOT,
    });

    if (options?.squash) {
      await execAsync(`git commit -m "${commitMsg}"`, { cwd: REPO_ROOT }).catch(() => {});
    }

    // 4. Prune worktree & branch if requested (default: true)
    if (options?.prune !== false) {
      if (fs.existsSync(worktreePath)) {
        await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: REPO_ROOT }).catch(() => {});
      }
      await execAsync("git worktree prune", { cwd: REPO_ROOT }).catch(() => {});
      await execAsync(`git branch -D "${branch}"`, { cwd: REPO_ROOT }).catch(() => {});
    }

    return {
      success: true,
      message: `Successfully merged ${branch} into ${baseBranch} (${options?.prune !== false ? "worktree pruned" : "worktree retained"}).`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Merge failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
