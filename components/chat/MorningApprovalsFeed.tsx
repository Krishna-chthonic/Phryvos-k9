"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Calendar,
  BookOpen,
  Check,
  X,
  Sparkles,
  Play,
  RotateCcw,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StagedDaemonAction } from "@/lib/agent/daemons";

export function MorningApprovalsFeed() {
  const [actions, setActions] = useState<StagedDaemonAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningDaemon, setRunningDaemon] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/approvals");
      if (res.ok) {
        const data = await res.json();
        setActions(data.stagedDaemons || []);
      }
    } catch {
      // Ignored if network drop or locked
    }
  }, []);

  useEffect(() => {
    void fetchApprovals();
  }, [fetchApprovals]);

  const handleResolve = async (id: string, decision: "approved" | "rejected") => {
    setLoading(true);
    try {
      await fetch("/api/chat/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_staged", id, decision }),
      });
      await fetchApprovals();
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAll = async (decision: "approved" | "rejected") => {
    setLoading(true);
    try {
      await fetch("/api/chat/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_all", decision }),
      });
      await fetchApprovals();
    } finally {
      setLoading(false);
    }
  };

  const handleRunDaemon = async (daemon: "planner" | "tutor") => {
    setRunningDaemon(daemon);
    try {
      await fetch("/api/chat/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_daemon", daemon }),
      });
      await fetchApprovals();
    } finally {
      setRunningDaemon(null);
    }
  };

  const pendingList = actions.filter((a) => a.status === "pending");
  const pastList = actions.filter((a) => a.status !== "pending");

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 p-4 space-y-4 overflow-y-auto">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-purple-600" />
            Morning Approvals Feed & Daemon Governance
          </h2>
          <p className="text-xs text-zinc-500">
            Human-in-the-loop review for autonomous background agent actions (Planner & Nightly Tutor).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={runningDaemon !== null}
            onClick={() => handleRunDaemon("planner")}
            className="text-xs h-8 px-3"
          >
            <Calendar className="mr-1.5 h-3.5 w-3.5 text-blue-500" />
            {runningDaemon === "planner" ? "Planning..." : "Run Planner Daemon"}
          </Button>

          <Button
            variant="secondary"
            disabled={runningDaemon !== null}
            onClick={() => handleRunDaemon("tutor")}
            className="text-xs h-8 px-3"
          >
            <BookOpen className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
            {runningDaemon === "tutor" ? "Synthesizing..." : "Run Nightly Tutor"}
          </Button>

          {pendingList.length > 0 && (
            <Button
              variant="primary"
              disabled={loading}
              onClick={() => handleResolveAll("approved")}
              className="text-xs h-8 px-3 bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Check className="mr-1.5 h-3.5 w-3.5" /> Approve All ({pendingList.length})
            </Button>
          )}
        </div>
      </div>

      {/* Pending Items */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Pending Human Review ({pendingList.length})
          </span>
        </div>

        {pendingList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center text-xs text-zinc-400">
            No pending daemon actions. Click &ldquo;Run Planner Daemon&rdquo; or &ldquo;Run Nightly Tutor&rdquo; above to trigger an autonomous pass.
          </div>
        ) : (
          pendingList.map((action) => {
            const isExpanded = expandedId === action.id;
            return (
              <div
                key={action.id}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        action.daemon === "planner"
                          ? "bg-blue-100 dark:bg-blue-950/60 text-blue-600"
                          : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600"
                      }`}
                    >
                      {action.daemon === "planner" ? (
                        <Calendar className="h-4 w-4" />
                      ) : (
                        <BookOpen className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                          {action.title}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-medium">
                          Pending Approval
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                        {action.description}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400">
                        <Clock className="h-3 w-3" />
                        <span>Staged {new Date(action.stagedAt).toLocaleTimeString()}</span>
                        <span>•</span>
                        <span>Target: {action.targetDate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      variant="secondary"
                      onClick={() => handleResolve(action.id, "rejected")}
                      className="h-7 text-xs px-2.5 text-zinc-600 hover:text-red-600"
                    >
                      <X className="mr-1 h-3 w-3" /> Reject
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => handleResolve(action.id, "approved")}
                      className="h-7 text-xs px-2.5 bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <Check className="mr-1 h-3 w-3" /> Approve
                    </Button>
                  </div>
                </div>

                {/* Inspect Payload Toggle */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : action.id)}
                    className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3 w-3" /> Hide Action Payload Diff
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" /> Inspect Action Payload Diff
                      </>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 p-2.5 font-mono text-xs overflow-x-auto text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-800">
                      <pre>{JSON.stringify(action.payload, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* History Feed */}
      {pastList.length > 0 && (
        <div className="space-y-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Resolved Action History ({pastList.length})
          </span>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {pastList.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800"
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      h.status === "approved" ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                  <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                    {h.title}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    h.status === "approved"
                      ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
                      : "text-red-600 bg-red-50 dark:bg-red-950/40"
                  }`}
                >
                  {h.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
