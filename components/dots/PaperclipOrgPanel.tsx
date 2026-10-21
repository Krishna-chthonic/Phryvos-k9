"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Building2,
  DollarSign,
  ShieldAlert,
  CalendarCheck2,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  Check,
  Lock,
  Unlock,
  Sliders,
  Loader2,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import type {
  PaperclipCompanyState,
  OrgMember,
  MemberBudget,
  StandupSession,
  GovernanceApproval,
} from "@/lib/paperclip/paperclip-engine";

export function PaperclipOrgPanel() {
  const [company, setCompany] = useState<PaperclipCompanyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"org" | "budgets" | "standup" | "governance">("org");
  const [runningStandup, setRunningStandup] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [editingBudgetMember, setEditingBudgetMember] = useState<string | null>(null);
  const [dailyCapInput, setDailyCapInput] = useState<string>("5.00");
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadCompanyState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/paperclip");
      if (res.ok) {
        const json = await res.json();
        if (json.company) setCompany(json.company);
      }
    } catch (err) {
      console.error("Failed to load paperclip company state:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompanyState();
  }, [loadCompanyState]);

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleRunStandup = async () => {
    setRunningStandup(true);
    try {
      const res = await fetch("/api/paperclip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_standup" }),
      });
      const json = await res.json();
      if (json.success) {
        showNotification("success", "Autonomous standup synthesized successfully!");
        if (json.company) setCompany(json.company);
      }
    } catch (err) {
      showNotification("error", String(err));
    } finally {
      setRunningStandup(false);
    }
  };

  const handleResolveApproval = async (id: string, decision: "approved" | "rejected") => {
    setResolvingId(id);
    try {
      const res = await fetch("/api/paperclip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_approval", id, decision }),
      });
      const json = await res.json();
      if (json.success) {
        showNotification("success", json.message);
        if (json.company) setCompany(json.company);
      }
    } catch (err) {
      showNotification("error", String(err));
    } finally {
      setResolvingId(null);
    }
  };

  const handleSaveBudget = async (memberId: string) => {
    try {
      const val = parseFloat(dailyCapInput);
      if (isNaN(val) || val <= 0) return;
      const res = await fetch("/api/paperclip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_budget",
          memberId,
          updates: { dailyCapUsd: val, spentTodayUsd: 0 },
        }),
      });
      const json = await res.json();
      if (json.success && json.company) {
        setCompany(json.company);
        setEditingBudgetMember(null);
        showNotification("success", `Updated daily budget cap to $${val.toFixed(2)}`);
      }
    } catch (err) {
      showNotification("error", String(err));
    }
  };

  if (loading && !company) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  const members = company?.members || [];
  const budgets = company?.budgets || {};
  const standups = company?.recentStandups || [];
  const approvals = company?.pendingApprovals || [];
  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const hardStoppedMembers = members.filter((m) => m.isHardStopped);

  const spendPct = company
    ? Math.min(100, Math.round((company.totalSpendMonthUsd / company.monthlyCompanyCapUsd) * 100))
    : 0;

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden text-zinc-900 dark:text-zinc-100">
      {/* Top Banner & Overview */}
      <div className="shrink-0 p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center font-bold">
              📎
            </div>
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                Paperclip Virtual AI Organization & Cost Governance
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30">
                  Paperclip AI
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Department hierarchy, hard-stop budgets, and autonomous daily standups
              </p>
            </div>
          </div>

          <button
            onClick={loadCompanyState}
            disabled={loading}
            className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            title="Refresh Company"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Global Cost Meter */}
        <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-amber-500" />
              Monthly Budget Spend: ${company?.totalSpendMonthUsd.toFixed(2)} / ${company?.monthlyCompanyCapUsd.toFixed(2)}
            </span>
            <span className="font-bold text-amber-600 dark:text-amber-400">
              {spendPct}% Used
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all rounded-full ${
                spendPct >= 90
                  ? "bg-rose-500"
                  : spendPct >= 75
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${spendPct}%` }}
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setActiveTab("org")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              activeTab === "org"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Org Chart ({members.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("budgets")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              activeTab === "budgets"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
            }`}
          >
            <DollarSign className="h-3.5 w-3.5" />
            <span>Budgets & Hard-Stops {hardStoppedMembers.length > 0 && `(🛑 ${hardStoppedMembers.length})`}</span>
          </button>

          <button
            onClick={() => setActiveTab("standup")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              activeTab === "standup"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
            }`}
          >
            <CalendarCheck2 className="h-3.5 w-3.5" />
            <span>Standups ({standups.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("governance")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              activeTab === "governance"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Approvals {pendingApprovals.length > 0 && `(${pendingApprovals.length})`}</span>
          </button>
        </div>

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

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* TAB 1: ORG CHART */}
        {activeTab === "org" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {members.map((m) => {
                const manager = members.find((mgr) => mgr.id === m.reportsTo);
                return (
                  <div
                    key={m.id}
                    className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2.5 shadow-sm hover:border-amber-500/30 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{m.avatar}</span>
                        <div>
                          <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            {m.name}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {m.title}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded ${
                          m.isHardStopped
                            ? "bg-rose-500/20 text-rose-500 animate-pulse font-bold"
                            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {m.isHardStopped ? "HARD-STOPPED" : "ACTIVE"}
                      </span>
                    </div>

                    <div className="pt-1 text-[11px] text-zinc-500 dark:text-zinc-400 space-y-1 font-mono">
                      <div className="flex justify-between">
                        <span>Dept:</span>
                        <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                          {m.department}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tier:</span>
                        <span className="font-semibold text-amber-500">{m.tier}</span>
                      </div>
                      {manager && (
                        <div className="flex justify-between">
                          <span>Reports To:</span>
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            {manager.name} ({manager.title})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: BUDGETS & HARD-STOPS */}
        {activeTab === "budgets" && (
          <div className="space-y-3">
            {members.map((m) => {
              const b = budgets[m.id];
              if (!b) return null;
              const dailyUsedPct = Math.min(100, Math.round((b.spentTodayUsd / b.dailyCapUsd) * 100));
              const isEditing = editingBudgetMember === m.id;

              return (
                <div
                  key={m.id}
                  className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{m.avatar}</span>
                      <div>
                        <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                          {m.name}
                          {m.isHardStopped && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-500 font-mono font-bold animate-pulse">
                              🛑 HARD-STOPPED
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {m.department} · {m.title}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-zinc-700 dark:text-zinc-300">
                        ${b.spentTodayUsd.toFixed(2)} / ${b.dailyCapUsd.toFixed(2)} today
                      </span>
                      <button
                        onClick={() => {
                          setEditingBudgetMember(m.id);
                          setDailyCapInput(b.dailyCapUsd.toString());
                        }}
                        className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                        title="Adjust Budget Cap"
                      >
                        <Sliders className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Daily Budget Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                      <span>Daily Usage: {dailyUsedPct}%</span>
                      <span>Tokens: {b.tokensUsedToday.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          dailyUsedPct >= 100
                            ? "bg-rose-500"
                            : dailyUsedPct >= 80
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${dailyUsedPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Inline Cap Editor */}
                  {isEditing && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs">
                      <span className="font-mono text-zinc-500">New Daily Cap ($):</span>
                      <input
                        type="number"
                        step="0.5"
                        value={dailyCapInput}
                        onChange={(e) => setDailyCapInput(e.target.value)}
                        className="w-20 px-2 py-0.5 rounded bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 font-mono text-xs outline-none"
                      />
                      <button
                        onClick={() => handleSaveBudget(m.id)}
                        className="px-2.5 py-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold cursor-pointer"
                      >
                        Save & Unlock
                      </button>
                      <button
                        onClick={() => setEditingBudgetMember(null)}
                        className="text-zinc-400 hover:text-zinc-200 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 3: STANDUPS */}
        {activeTab === "standup" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  Daily Autonomous Standup Routine
                </h3>
                <p className="text-[11px] text-zinc-500">
                  Virtual coworkers report accomplishments, goals, and roadblocks
                </p>
              </div>

              <button
                onClick={handleRunStandup}
                disabled={runningStandup}
                className="h-8 px-3.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {runningStandup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                <span>Run Standup Routine</span>
              </button>
            </div>

            {standups.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                No standup sessions recorded yet. Click &ldquo;Run Standup Routine&rdquo; to execute.
              </div>
            ) : (
              standups.map((s) => (
                <div
                  key={s.id}
                  className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-2">
                    <span className="text-xs font-mono font-bold text-amber-500">
                      Standup Session: {s.dateStr}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {new Date(s.createdAt).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Executive Briefing Banner */}
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 font-sans leading-relaxed">
                    📢 {s.executiveBriefing}
                  </div>

                  {/* Individual Reports */}
                  <div className="space-y-2 pt-1">
                    {s.entries.map((e, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-800/60 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between font-mono">
                          <span className="font-bold text-zinc-800 dark:text-zinc-200">
                            {e.memberName} [{e.department}]
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-0.5">
                          <div>
                            <span className="text-emerald-500 font-semibold">Accomplished:</span>{" "}
                            {e.yesterdayAccomplished.join("; ")}
                          </div>
                          <div>
                            <span className="text-blue-500 font-semibold">Planned:</span>{" "}
                            {e.todayPlanned.join("; ")}
                          </div>
                          {e.blockers.length > 0 && (
                            <div>
                              <span className="text-rose-500 font-semibold">Blockers:</span>{" "}
                              {e.blockers.join("; ")}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 4: GOVERNANCE APPROVALS */}
        {activeTab === "governance" && (
          <div className="space-y-3">
            {approvals.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                Governance queue is empty. High-risk actions will appear here for human authorization.
              </div>
            ) : (
              approvals.map((appr) => (
                <div
                  key={appr.id}
                  className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2.5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] uppercase font-mono px-2 py-0.5 rounded font-bold border ${
                          appr.riskLevel === "critical"
                            ? "bg-rose-500/20 text-rose-500 border-rose-500/30"
                            : appr.riskLevel === "high"
                            ? "bg-amber-500/20 text-amber-500 border-amber-500/30"
                            : "bg-blue-500/20 text-blue-500 border-blue-500/30"
                        }`}
                      >
                        {appr.riskLevel} Risk
                      </span>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {appr.requesterName} requests &ldquo;{appr.actionType}&rdquo;
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${
                        appr.status === "approved"
                          ? "bg-emerald-500/20 text-emerald-500 font-bold"
                          : appr.status === "rejected"
                          ? "bg-rose-500/20 text-rose-500 font-bold"
                          : "bg-amber-500/20 text-amber-500 animate-pulse font-bold"
                      }`}
                    >
                      {appr.status}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-600 dark:text-zinc-300 font-sans">
                    {appr.reason}
                  </p>

                  {/* Actions for Pending */}
                  {appr.status === "pending" && (
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                      <button
                        onClick={() => handleResolveApproval(appr.id, "rejected")}
                        disabled={resolvingId === appr.id}
                        className="px-3 py-1 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleResolveApproval(appr.id, "approved")}
                        disabled={resolvingId === appr.id}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" />
                        <span>Approve Action</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
