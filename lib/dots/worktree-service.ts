/**
 * Git Worktrees Engine for Autonomous AI Coworkers (Dots)
 * Inspired by StablyAI Orca
 * 
 * Provides isolated, zero-conflict working directories for multiple Dots
 * so they can develop, test, and write code in parallel without dirtying
 * or colliding on the main repository branch.
 */

import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import util from "node:util";

const execAsync = util.promisify(exec);

export interface DotWorktreeInfo {
  dotName: string;
  worktreePath: string;
  branch: string;
  headCommit: string;
  isClean: boolean;
  uncommittedFiles: string[];
}

/** Root repository directory */
const REPO_ROOT = process.cwd();
const WORKTREE_BASE_DIR = path.join(REPO_ROOT, ".phryvos", "worktrees");

/**
 * Sanitizes Dot name to safe git branch & folder name
 */
export function sanitizeDotSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "dot";
}

/**
 * Ensures the worktree base directory exists
 */
function ensureBaseDir(): void {
  if (!fs.existsSync(WORKTREE_BASE_DIR)) {
    fs.mkdirSync(WORKTREE_BASE_DIR, { recursive: true });
  }
}

/**
 * Checks if a specific git branch exists locally
 */
async function branchExists(branchName: string): Promise<boolean> {
  try {
    await execAsync(`git show-ref --verify --quiet refs/heads/${branchName}`, { cwd: REPO_ROOT });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists all active git worktrees in the repository
 */
export async function listWorktrees(): Promise<Array<{ path: string; head: string; branch: string }>> {
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
    return trees;
  } catch (err) {
    console.error("[Worktree] Failed to list worktrees:", err);
    return [];
  }
}

/**
 * Ensures a dedicated isolated git worktree exists for a Dot.
 * If not present, creates one with a dedicated branch `dot/<dotName>`.
 */
export async function ensureDotWorktree(
  dotName: string,
  baseBranch = "main"
): Promise<{ worktreePath: string; branch: string; created: boolean }> {
  ensureBaseDir();
  const slug = sanitizeDotSlug(dotName);
  const worktreePath = path.join(WORKTREE_BASE_DIR, slug);
  const branchName = `dot/${slug}`;

  // Check if worktree directory already exists and is valid
  if (fs.existsSync(worktreePath)) {
    const trees = await listWorktrees();
    const existing = trees.find((t) => path.resolve(t.path) === path.resolve(worktreePath));
    if (existing) {
      return {
        worktreePath,
        branch: existing.branch || branchName,
        created: false,
      };
    }
    // Stale directory without active worktree registration, prune and re-register
    await execAsync("git worktree prune", { cwd: REPO_ROOT }).catch(() => {});
  }

  // Branch setup: create branch if doesn't exist, or checkout existing
  const hasBranch = await branchExists(branchName);
  if (hasBranch) {
    await execAsync(`git worktree add "${worktreePath}" "${branchName}"`, { cwd: REPO_ROOT });
  } else {
    await execAsync(`git worktree add -b "${branchName}" "${worktreePath}" "${baseBranch}"`, {
      cwd: REPO_ROOT,
    });
  }

  return {
    worktreePath,
    branch: branchName,
    created: true,
  };
}

/**
 * Inspects the status of a Dot's worktree (changes, uncommitted files, commits)
 */
export async function getDotWorktreeInfo(dotName: string): Promise<DotWorktreeInfo | null> {
  const slug = sanitizeDotSlug(dotName);
  const worktreePath = path.join(WORKTREE_BASE_DIR, slug);

  if (!fs.existsSync(worktreePath)) return null;

  try {
    const { stdout: branchOut } = await execAsync("git rev-parse --abbrev-ref HEAD", {
      cwd: worktreePath,
    });
    const { stdout: headOut } = await execAsync("git rev-parse HEAD", { cwd: worktreePath });
    const { stdout: statusOut } = await execAsync("git status --porcelain", { cwd: worktreePath });

    const lines = statusOut.trim() ? statusOut.trim().split("\n") : [];
    const files = lines.map((l) => l.substring(3).trim());

    return {
      dotName,
      worktreePath,
      branch: branchOut.trim(),
      headCommit: headOut.trim().substring(0, 7),
      isClean: lines.length === 0,
      uncommittedFiles: files,
    };
  } catch {
    return null;
  }
}

/**
 * Merges a Dot's branch back into target branch (default: main)
 */
export async function mergeDotWorktree(
  dotName: string,
  targetBranch = "main"
): Promise<{ success: boolean; message: string }> {
  if (!targetBranch || !/^[a-zA-Z0-9_./-]+$/.test(targetBranch)) {
    return { success: false, message: `Invalid target branch name "${targetBranch}"` };
  }

  const slug = sanitizeDotSlug(dotName);
  const branchName = `dot/${slug}`;
  const worktreePath = path.join(WORKTREE_BASE_DIR, slug);

  if (!fs.existsSync(worktreePath)) {
    return { success: false, message: `Worktree for ${dotName} does not exist` };
  }

  try {
    // 1. Commit any remaining changes in worktree
    const { stdout: status } = await execAsync("git status --porcelain", { cwd: worktreePath });
    if (status.trim()) {
      await execAsync('git add -A && git commit -m "chore(dot): auto checkpoint before merge"', {
        cwd: worktreePath,
      });
    }

    // 2. Perform merge in repo root
    await execAsync(`git checkout ${targetBranch} && git merge --no-ff "${branchName}" -m "Merge dot worktree: ${branchName} into ${targetBranch}"`, {
      cwd: REPO_ROOT,
    });

    return { success: true, message: `Successfully merged ${branchName} into ${targetBranch}` };
  } catch (err) {
    return {
      success: false,
      message: `Merge conflict or error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Removes and cleans up a Dot's worktree when no longer needed
 */
export async function removeDotWorktree(
  dotName: string,
  deleteBranch = false
): Promise<{ success: boolean; message: string }> {
  const slug = sanitizeDotSlug(dotName);
  const branchName = `dot/${slug}`;
  const worktreePath = path.join(WORKTREE_BASE_DIR, slug);

  try {
    if (fs.existsSync(worktreePath)) {
      await execAsync(`git worktree remove --force "${worktreePath}"`, { cwd: REPO_ROOT });
    }
    await execAsync("git worktree prune", { cwd: REPO_ROOT });

    if (deleteBranch && (await branchExists(branchName))) {
      await execAsync(`git branch -D "${branchName}"`, { cwd: REPO_ROOT });
    }

    return { success: true, message: `Worktree for ${dotName} removed cleanly` };
  } catch (err) {
    return {
      success: false,
      message: `Failed to remove worktree: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
