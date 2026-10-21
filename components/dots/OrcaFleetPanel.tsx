"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  GitPullRequest,
  GitBranch,
  GitMerge,
  GitCommit,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Plus,
  Trash2,
  FileCode,
  Eye,
  Loader2,
  Check,
  Zap,
} from "lucide-react";
import type { FleetWorktree, WorktreeDiffFile, DryRunMergeResult } from "@/lib/orca/orca-engine";

export function OrcaFleetPanel() {
  const [fleet, setFleet] = useState<FleetWorktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseBranch, setBaseBranch] = useState("main");
  const [newWorktreeName, setNewWorktreeName] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<{
    name: string;
    files: WorktreeDiffFile[];
    summary: { filesChanged: number; insertions: number; deletions: number };
  } | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunMergeResult | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orca?base=${encodeURIComponent(baseBranch)}`);
      if (res.ok) {
        const json = await res.json();
        setFleet(json.fleet || []);
      }
    } catch (err) {
      console.error("Failed to load Orca fleet:", err);
    } finally {
      setLoading(false);
    }
  }, [baseBranch]);

  useEffect(() => {
    loadFleet();
  }, [loadFleet]);

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorktreeName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/orca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: newWorktreeName.trim(), baseBranch }),
      });
      const json = await res.json();
      if (json.success) {
        showNotification("success", json.message);
        setNewWorktreeName("");
        await loadFleet();
      } else {
        showNotification("error", json.message || "Failed to create worktree");
      }
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleInspectDiff = async (name: string) => {
    setActionInProgress(name);
    try {
      const res = await fetch("/api/orca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "diff", name, baseBranch }),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedDiff({
          name,
          files: json.files || [],
          summary: json.summary || { filesChanged: 0, insertions: 0, deletions: 0 },
        });
      } else {
        showNotification("error", json.error || "Failed to fetch diff");
      }
    } catch (err) {
      showNotification("error", String(err));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDryRun = async (name: string) => {
    setActionInProgress(name);
    try {
      const res = await fetch("/api/orca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dry_run", name, baseBranch }),
      });
      const json = await res.json();
      if (json.success && json.dryRun) {
        setDryRunResult(json.dryRun);
      } else {
        showNotification("error", json.error || "Dry run failed");
      }
    } catch (err) {
      showNotification("error", String(err));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleMerge = async (name: string, squash = false) => {
    if (!confirm(`Are you sure you want to merge "${name}" into ${baseBranch} and prune the worktree?`)) {
      return;
    }

    setActionInProgress(name);
    try {
      const res = await fetch("/api/orca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge", name, baseBranch, squash, prune: true }),
      });
      const json = await res.json();
      if (json.success) {
        showNotification("success", json.message);
        await loadFleet();
      } else {
        showNotification("error", json.message || "Merge rejected");
      }
    } catch (err) {
      showNotification("error", String(err));
    } finally {
      setActionInProgress(null);
    }
  };

  const cleanCount = fleet.filter((w) => w.mergeability === "CLEAN").length;
  const conflictCount = fleet.filter((w) => w.mergeability === "CONFLICT").length;
  const dirtyCount = fleet.filter((w) => w.mergeability === "DIRTY").length;

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden text-zinc-900 dark:text-zinc-100">
      {/* Top Header */}
      <div className="shrink-0 p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center font-bold">
              🐋
            </div>
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                Orca Worktree Fleet Manager
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  StablyAI Orca
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Zero-collision isolated agent working directories with 3-way merge conflict detection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700">
              <span className="font-mono">Base:</span>
              <input
                type="text"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                className="w-16 bg-transparent font-mono font-semibold text-zinc-800 dark:text-zinc-200 outline-none"
              />
            </div>

            <button
              onClick={loadFleet}
              disabled={loading}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
              title="Refresh Fleet"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Metrics Overview */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60">
            <span className="text-[10px] text-zinc-400 uppercase font-mono">Total Trees</span>
            <div className="text-sm font-bold font-mono text-zinc-800 dark:text-zinc-200 mt-0.5">
              {fleet.length}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-mono">Clean Merge</span>
            <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
              {cleanCount}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <span className="text-[10px] text-rose-600 dark:text-rose-400 uppercase font-mono">Conflicts</span>
            <div className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400 mt-0.5">
              {conflictCount}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-mono">Dirty / Mod</span>
            <div className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
              {dirtyCount}
            </div>
          </div>
        </div>

        {/* Create Worktree Bar */}
        <form onSubmit={handleCreate} className="flex gap-2">
          <div className="relative flex-1">
            <GitBranch className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={newWorktreeName}
              onChange={(e) => setNewWorktreeName(e.target.value)}
              placeholder="Spawn new agent worktree (e.g. 'feature_auth_flow', 'bugfix_db_leak')..."
              className="w-full h-8 pl-8 pr-3 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-200 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newWorktreeName.trim()}
            className="h-8 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span>Spawn Worktree</span>
          </button>
        </form>

        {/* Notification Alert */}
        {notification && (
          <div
            className={`p-2.5 rounded-lg text-xs font-medium border flex items-center gap-2 ${
              notification.type === "success"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
            }`}
          >
            {notification.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{notification.text}</span>
          </div>
        )}
      </div>

      {/* Main Worktrees List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {fleet.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-400 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 space-y-2">
            <GitPullRequest className="h-8 w-8 mx-auto text-zinc-300 dark:text-zinc-700" />
            <p>No active agent worktrees currently spawned in the fleet.</p>
            <p className="text-[11px] text-zinc-500">
              Create a new worktree above to give an AI agent an isolated working space.
            </p>
          </div>
        ) : (
          fleet.map((w) => (
            <div
              key={w.id}
              className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-sm hover:border-indigo-500/30 transition-all"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                    <GitBranch className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold font-mono text-zinc-900 dark:text-zinc-100">
                        {w.name}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        ({w.branch})
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400">
                      head: {w.headCommit} · path: {w.worktreePath.replace(process.cwd(), ".")}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Mergeability Badge */}
                  <span
                    className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded-full border ${
                      w.mergeability === "CLEAN"
                        ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30"
                        : w.mergeability === "CONFLICT"
                        ? "bg-rose-500/20 text-rose-500 border-rose-500/30 animate-pulse font-bold"
                        : w.mergeability === "DIRTY"
                        ? "bg-amber-500/20 text-amber-500 border-amber-500/30"
                        : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
                    }`}
                  >
                    {w.mergeability}
                  </span>

                  {/* Ahead / Behind */}
                  <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                    ↑{w.commitsAhead} ↓{w.commitsBehind}
                  </span>

                  {/* Diff Stats */}
                  {w.diffSummary && (
                    <span className="text-[10px] font-mono text-zinc-400">
                      <span className="text-emerald-500">+{w.diffSummary.insertions}</span> /{" "}
                      <span className="text-rose-500">-{w.diffSummary.deletions}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Conflict Warnings */}
              {w.conflictingFiles && w.conflictingFiles.length > 0 && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Merge Conflicts Detected in {w.conflictingFiles.length} file(s):</span>
                  </div>
                  <div className="font-mono text-[11px] pl-5">
                    {w.conflictingFiles.map((f, i) => (
                      <div key={i}>• {f}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dirty Uncommitted Files Warning */}
              {!w.isClean && (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400 font-mono">
                  ⚠️ {w.uncommittedFiles.length} uncommitted file(s) in worktree
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 dark:border-zinc-800/80 pt-2.5">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleInspectDiff(w.name)}
                    disabled={actionInProgress === w.name}
                    className="h-7 px-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="h-3 w-3" />
                    <span>Diff</span>
                  </button>

                  <button
                    onClick={() => handleDryRun(w.name)}
                    disabled={actionInProgress === w.name}
                    className="h-7 px-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Zap className="h-3 w-3" />
                    <span>Dry-Run</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleMerge(w.name, false)}
                    disabled={actionInProgress === w.name || w.mergeability === "CONFLICT"}
                    className="h-7 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                    title={`Merge ${w.branch} into ${baseBranch} and prune worktree`}
                  >
                    {actionInProgress === w.name ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <GitMerge className="h-3 w-3" />
                    )}
                    <span>Merge & Prune</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Diff Modal Slide-over */}
      {selectedDiff && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-indigo-500" />
                  3-Way Diff: {selectedDiff.name} &rarr; {baseBranch}
                </h3>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">
                  {selectedDiff.summary.filesChanged} files changed (
                  <span className="text-emerald-500">+{selectedDiff.summary.insertions}</span>,{" "}
                  <span className="text-rose-500">-{selectedDiff.summary.deletions}</span>)
                </p>
              </div>
              <button
                onClick={() => setSelectedDiff(null)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
              {selectedDiff.files.length === 0 ? (
                <div className="p-8 text-center text-zinc-400">No file diffs between branches.</div>
              ) : (
                selectedDiff.files.map((f, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 overflow-hidden"
                  >
                    <div className="p-2.5 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {f.filePath}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        <span className="text-emerald-500">+{f.insertions}</span> /{" "}
                        <span className="text-rose-500">-{f.deletions}</span>
                      </span>
                    </div>
                    {f.patch && (
                      <pre className="p-3 text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed text-zinc-700 dark:text-zinc-300 max-h-48 overflow-y-auto">
                        {f.patch}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dry Run Modal */}
      {dryRunResult && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-indigo-500" />
                Dry-Run Merge Result
              </h3>
              <button
                onClick={() => setDryRunResult(null)}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <div
              className={`p-3 rounded-xl border text-xs space-y-1 ${
                dryRunResult.canMergeCleanly
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
              }`}
            >
              <div className="font-semibold flex items-center gap-1.5">
                {dryRunResult.canMergeCleanly ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <span>
                  {dryRunResult.canMergeCleanly
                    ? "Clean merge verified! Safe to execute."
                    : `${dryRunResult.conflictCount} conflict(s) detected.`}
                </span>
              </div>
              <p className="font-sans text-[11px]">{dryRunResult.recommendedResolution}</p>
            </div>

            {dryRunResult.conflictingFiles.length > 0 && (
              <div className="space-y-1 font-mono text-xs">
                <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                  Conflicting Files:
                </span>
                {dryRunResult.conflictingFiles.map((f, i) => (
                  <div key={i} className="p-1.5 rounded bg-zinc-100 dark:bg-zinc-800 text-rose-400">
                    • {f}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setDryRunResult(null)}
                className="px-4 py-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
