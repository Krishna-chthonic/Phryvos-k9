"use client";

import * as React from "react";
import { Plus, Target, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoalRow, MilestoneRow } from "@/lib/goal-service";

// ------------------------------------------------------------ client API

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, opts);
  const body = (await res.json().catch(() => null)) as T & {
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

// ------------------------------------------------------------ modal

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ main app

export function GoalsApp() {
  const [goals, setGoals] = React.useState<GoalRow[]>([]);
  const [selectedGoal, setSelectedGoal] = React.useState<GoalRow | null>(null);
  const [milestones, setMilestones] = React.useState<MilestoneRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [goalForm, setGoalForm] = React.useState({ title: "", targetDate: "", description: "" });
  const [milestoneForm, setMilestoneForm] = React.useState({ title: "", dueDate: "" });
  const [showGoalModal, setShowGoalModal] = React.useState(false);
  const [showMilestoneModal, setShowMilestoneModal] = React.useState(false);

  React.useEffect(() => {
    loadGoals();
  }, []);

  async function loadGoals() {
    setLoading(true);
    try {
      const data = await apiFetch<{ goals: GoalRow[] }>("/api/goals");
      setGoals(data.goals);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function selectGoal(goal: GoalRow) {
    setSelectedGoal(goal);
    const data = await apiFetch<{ milestones: MilestoneRow[] }>(`/api/goals/${goal.id}/milestones`);
    setMilestones(data.milestones);
  }

  async function handleCreateGoal() {
    if (!goalForm.title.trim()) return;
    try {
      const data = await apiFetch<{ goal: GoalRow }>("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: goalForm.title,
          targetDate: goalForm.targetDate || null,
          description: goalForm.description || null,
        }),
      });
      setShowGoalModal(false);
      setGoalForm({ title: "", targetDate: "", description: "" });
      await loadGoals();
      selectGoal(data.goal);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreateMilestone() {
    if (!milestoneForm.title.trim() || !selectedGoal) return;
    try {
      const data = await apiFetch<{ milestone: MilestoneRow }>(
        `/api/goals/${selectedGoal.id}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: milestoneForm.title,
            dueDate: milestoneForm.dueDate || null,
          }),
        },
      );
      setShowMilestoneModal(false);
      setMilestoneForm({ title: "", dueDate: "" });
      setMilestones((m) => [...m, data.milestone]);
      // Refresh goal
      const goalData = await apiFetch<{ goal: GoalRow }>(`/api/goals/${selectedGoal.id}`);
      setSelectedGoal(goalData.goal);
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleMilestone(milestone: MilestoneRow) {
    if (!selectedGoal) return;
    try {
      await apiFetch(`/api/goals/${selectedGoal.id}/milestones/${milestone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !milestone.done }),
      });
      setMilestones((m) =>
        m.map((ml) => (ml.id === milestone.id ? { ...ml, done: !ml.done } : ml)),
      );
      // Refresh goal progress
      const goalData = await apiFetch<{ goal: GoalRow }>(`/api/goals/${selectedGoal.id}`);
      setSelectedGoal(goalData.goal);
    } catch {
      // ignore
    }
  }

  const doneCount = milestones.filter((m) => m.done).length;
  const progress = selectedGoal?.progressPct ?? 0;

  return (
    <div className="flex h-full flex-col gap-4 p-5 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Goals</h1>
        <Button variant="primary" onClick={() => setShowGoalModal(true)}>
          <Plus className="mr-1 h-4 w-4" /> New Goal
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Goals list */}
        <div className="w-72 flex-shrink-0 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            All Goals
          </h2>
          {goals.map((g) => (
            <button
              key={g.id}
              onClick={() => selectGoal(g)}
              className={`mb-2 w-full rounded-lg p-3 text-left transition-colors cursor-pointer ${
                selectedGoal?.id === g.id
                  ? "bg-blue-50 ring-1 ring-blue-300 dark:bg-blue-950/40 dark:ring-blue-800"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{g.title}</span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: g.progressPct === 100 ? "#10b981" : "#3b82f6" }}
                >
                  {g.progressPct}%
                </span>
              </div>
              {g.targetDate && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Target: {g.targetDate}</p>
              )}
              <div className="mt-2 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${g.progressPct}%`,
                    background: g.progressPct === 100 ? "#10b981" : "#3b82f6",
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                {g.doneMilestoneCount}/{g.milestoneCount} milestones
              </p>
            </button>
          ))}
          {goals.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">No goals yet</p>
          )}
        </div>

        {/* Goal detail + milestones */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedGoal ? (
            <>
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{selectedGoal.title}</h2>
                  {selectedGoal.description && (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{selectedGoal.description}</p>
                  )}
                  {selectedGoal.targetDate && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Target date: {selectedGoal.targetDate}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div
                    className="text-2xl font-bold"
                    style={{ color: progress === 100 ? "#10b981" : "#3b82f6" }}
                  >
                    {progress}%
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {doneCount}/{milestones.length} done
                  </div>
                </div>
              </div>

              <div className="mb-4 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${progress}%`,
                    background: progress === 100 ? "#10b981" : "#3b82f6",
                  }}
                />
              </div>

              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Milestones ({doneCount}/{milestones.length})
                </h3>
                <Button variant="secondary" onClick={() => setShowMilestoneModal(true)}>
                  <Plus className="mr-1 h-4 w-4" /> Add Milestone
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {milestones.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => toggleMilestone(m)}
                    className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 mb-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-850 cursor-pointer"
                  >
                    {m.done ? (
                      <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
                    ) : (
                      <Circle className="h-5 w-5 flex-shrink-0 text-zinc-300 dark:text-zinc-600" />
                    )}
                    <div className="flex-1">
                      <span className={m.done ? "line-through text-zinc-400 dark:text-zinc-500" : "text-sm text-zinc-900 dark:text-zinc-100"}>
                        {m.title}
                      </span>
                      {m.dueDate && (
                        <span className="ml-2 text-xs text-zinc-400 dark:text-zinc-500">{m.dueDate}</span>
                      )}
                    </div>
                  </button>
                ))}
                {milestones.length === 0 && (
                  <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
                    No milestones — add one to track progress
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-zinc-400 dark:text-zinc-500">
              <div className="text-center">
                <Target className="mx-auto h-10 w-10 opacity-30" />
                <p className="mt-2 text-sm">Select a goal to view milestones</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Goal Modal */}
      <Modal open={showGoalModal} onClose={() => setShowGoalModal(false)} title="New Goal">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Title *</label>
            <Input
              value={goalForm.title}
              onChange={(e) => setGoalForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g., Learn TypeScript"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Target Date</label>
            <Input
              type="date"
              value={goalForm.targetDate}
              onChange={(e) => setGoalForm((f) => ({ ...f, targetDate: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Description</label>
            <Input
              value={goalForm.description}
              onChange={(e) => setGoalForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional description"
            />
          </div>
          <Button variant="primary" className="w-full" onClick={handleCreateGoal}>
            Create Goal
          </Button>
        </div>
      </Modal>

      {/* Create Milestone Modal */}
      <Modal open={showMilestoneModal} onClose={() => setShowMilestoneModal(false)} title="New Milestone">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Title *</label>
            <Input
              value={milestoneForm.title}
              onChange={(e) => setMilestoneForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g., Complete chapter 1"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Due Date</label>
            <Input
              type="date"
              value={milestoneForm.dueDate}
              onChange={(e) => setMilestoneForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>
          <Button variant="primary" className="w-full" onClick={handleCreateMilestone}>
            Add Milestone
          </Button>
        </div>
      </Modal>
    </div>
  );
}
