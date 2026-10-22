"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  Zap,
  Sparkles,
  Calendar,
  Kanban,
  List,
} from "lucide-react";
import { DotMascot } from "./DotMascot";
import type { DotDto, DotTaskDto } from "@/lib/dots-service";

interface DotTasksPanelProps {
  dot: DotDto;
  onRefreshMessages?: () => void;
}

const INTERVAL_PRESETS = [
  { label: "One-time (Run once)", value: null },
  { label: "Every 15 minutes", value: 900 },
  { label: "Every 30 minutes", value: 1800 },
  { label: "Every 1 hour", value: 3600 },
  { label: "Every 2 hours", value: 7200 },
  { label: "Every 6 hours", value: 21600 },
  { label: "Daily (Every 24 hours)", value: 86400 },
];

export function DotTasksPanel({ dot, onRefreshMessages }: DotTasksPanelProps) {
  const [tasks, setTasks] = useState<DotTaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState<number | null>(3600);
  const [submitting, setSubmitting] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/dots/${dot.id}/tasks`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (e) {
      console.error("Failed to load tasks", e);
    } finally {
      setLoading(false);
    }
  }, [dot.id]);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 8000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || submitting) return;

    if (intervalSeconds !== null && (intervalSeconds < 60 || intervalSeconds > 31536000)) {
      alert("Interval must be at least 60 seconds (1 minute) and at most 1 year.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/dots/${dot.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          intervalSeconds,
        }),
      });

      if (res.ok) {
        setPrompt("");
        setDialogOpen(false);
        await loadTasks();
      }
    } catch (e) {
      console.error("Failed to create task", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePause = async (task: DotTaskDto) => {
    const nextStatus = task.status === "paused" ? "queued" : "paused";
    setActionInProgress(task.id);
    try {
      await fetch(`/api/dots/${dot.id}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadTasks();
    } catch (e) {
      console.error("Failed to toggle task", e);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRunNow = async (task: DotTaskDto) => {
    setActionInProgress(task.id);
    try {
      await fetch(`/api/dots/${dot.id}/tasks/${task.id}`, {
        method: "POST",
      });
      await loadTasks();
      setTimeout(() => {
        loadTasks();
        onRefreshMessages?.();
      }, 2000);
    } catch (e) {
      console.error("Failed to run task now", e);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setActionInProgress(taskId);
    try {
      await fetch(`/api/dots/${dot.id}/tasks/${taskId}`, {
        method: "DELETE",
      });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (e) {
      console.error("Failed to delete task", e);
    } finally {
      setActionInProgress(null);
    }
  };

  const formatInterval = (sec: number | null) => {
    if (!sec) return "One-time run";
    if (sec < 3600) return `Repeats every ${Math.round(sec / 60)} min`;
    if (sec < 86400) return `Repeats every ${Math.round(sec / 3600)} hr`;
    return `Repeats daily (${Math.round(sec / 86400)}d)`;
  };

  const formatRelativeNext = (timestamp: number | null) => {
    if (!timestamp) return null;
    const diff = timestamp - Date.now();
    if (diff <= 0) return "Due now";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `in ${hrs}h ${mins % 60}m`;
  };

  return (
    <div className="flex h-full flex-col min-h-0 overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Top Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800 px-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <Clock className="h-4 w-4 text-emerald-500" />
          <div>
            <h2 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Company Task Board
            </h2>
            <p className="text-[10px] text-zinc-500">
              Autonomous background tasks executed by {dot.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === "kanban"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
              title="Kanban Board view"
            >
              <Kanban className="h-3 w-3" />
              <span className="hidden sm:inline">Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === "list"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
              title="List view"
            >
              <List className="h-3 w-3" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>

          <button
            onClick={() => setDialogOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 active:scale-95 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">New Task</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="flex flex-col items-center justify-center max-w-sm p-8 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
            <DotMascot character={dot.character} size="medium" state="idle" />
            <h3 className="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              No autonomous tasks scheduled for {dot.name}
            </h3>
            <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
              Assign recurring tasks to let {dot.name} work proactively in the background without needing your manual commands.
            </p>
            <button
              onClick={() => setDialogOpen(true)}
              className="mt-4 flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Schedule First Task</span>
            </button>
          </div>
        </div>
      ) : viewMode === "kanban" ? (
        /* KANBAN BOARD VIEW */
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 h-full min-w-[720px] lg:min-w-0">
            {[
              {
                id: "queued",
                title: "Backlog / Queued",
                icon: Clock,
                color: "text-sky-500",
                badge: "bg-sky-500/10 text-sky-500 border-sky-500/20",
                list: tasks.filter((t) => t.status === "queued"),
              },
              {
                id: "running",
                title: "In Progress",
                icon: Loader2,
                color: "text-amber-500",
                badge: "bg-amber-500/10 text-amber-500 border-amber-500/20",
                list: tasks.filter((t) => t.status === "running"),
              },
              {
                id: "completed",
                title: "Completed",
                icon: CheckCircle2,
                color: "text-emerald-500",
                badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                list: tasks.filter((t) => t.status === "completed"),
              },
              {
                id: "paused",
                title: "Paused / Blocked",
                icon: Pause,
                color: "text-zinc-400",
                badge: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
                list: tasks.filter((t) => t.status === "paused" || t.status === "failed"),
              },
            ].map((col) => {
              const ColIcon = col.icon;
              return (
                <div
                  key={col.id}
                  className="flex flex-col h-full rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40 p-3 min-h-[300px]"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-zinc-200/60 dark:border-zinc-800/60">
                    <div className="flex items-center gap-1.5">
                      <ColIcon className={`h-3.5 w-3.5 ${col.color} ${col.id === "running" ? "animate-spin" : ""}`} />
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{col.title}</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border ${col.badge}`}>
                      {col.list.length}
                    </span>
                  </div>

                  {/* Column Card List */}
                  <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                    {col.list.length === 0 ? (
                      <div className="flex items-center justify-center h-24 text-[11px] text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800/60 rounded-xl">
                        No tasks
                      </div>
                    ) : (
                      col.list.map((task) => {
                        const isBusy = actionInProgress === task.id;
                        const isRunning = task.status === "running";
                        const isPaused = task.status === "paused";

                        return (
                          <div
                            key={task.id}
                            className="group flex flex-col gap-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition"
                          >
                            <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 line-clamp-3 leading-snug">
                              {task.prompt}
                            </p>

                            <div className="flex items-center gap-1 text-[10px] text-zinc-500 flex-wrap">
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                {formatInterval(task.intervalSeconds)}
                              </span>
                              {task.nextRunAt && !isPaused && (
                                <span>• {formatRelativeNext(task.nextRunAt)}</span>
                              )}
                              {task.retryCount > 0 && (
                                <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  Retry {task.retryCount}/{task.maxRetries}
                                </span>
                              )}
                            </div>

                            {task.error && (
                              <div className="flex items-center gap-1 text-[10px] text-red-500 dark:text-red-400 bg-red-500/10 p-1.5 rounded-lg border border-red-500/20">
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                <span className="line-clamp-2">{task.error}</span>
                              </div>
                            )}

                            {task.lastResult && (
                              <p className="text-[10px] text-zinc-500 font-mono bg-zinc-50 dark:bg-zinc-950/60 p-1.5 rounded-lg border border-zinc-200/50 dark:border-zinc-800/50 line-clamp-2">
                                {task.lastResult}
                              </p>
                            )}

                            {/* Card Footer Actions */}
                            <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800/60">
                              <span className="text-[9px] font-mono text-zinc-400">
                                #{task.id.replace("task_", "")}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleRunNow(task)}
                                  disabled={isBusy || isRunning}
                                  className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 transition cursor-pointer"
                                  title="Run now"
                                >
                                  <Zap className="h-3 w-3 text-amber-500" />
                                </button>
                                <button
                                  onClick={() => handleTogglePause(task)}
                                  disabled={isBusy}
                                  className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition cursor-pointer"
                                  title={isPaused ? "Resume" : "Pause"}
                                >
                                  {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                                </button>
                                <button
                                  onClick={() => handleDeleteTask(task.id)}
                                  disabled={isBusy}
                                  className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* VERTICAL LIST VIEW */
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {tasks.map((task) => {
            const isBusy = actionInProgress === task.id;
            const isRunning = task.status === "running";
            const isPaused = task.status === "paused";
            const isCompleted = task.status === "completed";

            return (
              <div
                key={task.id}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700 transition"
              >
                {/* Left Task Info */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    {isRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                    ) : isPaused ? (
                      <Pause className="h-4 w-4 text-zinc-400" />
                    ) : isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-sky-500" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {task.prompt}
                      </span>
                      {/* Status Pill */}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          isRunning
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                            : isPaused
                            ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                            : isCompleted
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                        }`}
                      >
                        {task.status}
                      </span>
                      {task.retryCount > 0 && (
                        <span className="rounded-full px-2 py-0.5 text-[9px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/40 dark:border-amber-700/40">
                          Retry {task.retryCount}/{task.maxRetries}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500 flex-wrap">
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        {formatInterval(task.intervalSeconds)}
                      </span>
                      {task.nextRunAt && !isPaused && (
                        <span>• Next run {formatRelativeNext(task.nextRunAt)}</span>
                      )}
                      {task.lastRunAt && (
                        <span>• Ran {new Date(task.lastRunAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      )}
                    </div>

                    {task.lastResult && (
                      <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300 line-clamp-2 bg-white/60 dark:bg-zinc-950/40 p-2 rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 font-mono">
                        {task.lastResult}
                      </p>
                    )}

                    {task.error && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{task.error}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    onClick={() => handleRunNow(task)}
                    disabled={isBusy || isRunning}
                    className="flex h-7 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-50 cursor-pointer"
                    title="Trigger immediate execution"
                  >
                    <Zap className="h-3 w-3 text-amber-500" />
                    <span>Run Now</span>
                  </button>

                  <button
                    onClick={() => handleTogglePause(task)}
                    disabled={isBusy}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition cursor-pointer"
                    title={isPaused ? "Resume scheduling" : "Pause scheduling"}
                  >
                    {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  </button>

                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    disabled={isBusy}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition cursor-pointer"
                    title="Delete task"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Scheduled Task Dialog Modal */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-xs dark:bg-zinc-800">
                <Sparkles className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Assign Autonomous Task to {dot.name}
                </h3>
                <p className="text-xs text-zinc-500">
                  {dot.name} will wake up in the background and execute this on schedule.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Task Prompt / Standing Objective
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder={`e.g. Inspect repository changes, run tests, and report any build errors.\nor: Search the web for latest research updates on ${dot.role}.`}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 text-xs text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-100 dark:focus:border-zinc-600 transition resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Repetition Schedule
                </label>
                <select
                  value={intervalSeconds === null ? "null" : String(intervalSeconds)}
                  onChange={(e) =>
                    setIntervalSeconds(e.target.value === "null" ? null : Number(e.target.value))
                  }
                  className="w-full h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs text-zinc-900 outline-none dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                >
                  {INTERVAL_PRESETS.map((preset) => (
                    <option key={String(preset.value)} value={String(preset.value)}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !prompt.trim()}
                  className="rounded-xl bg-zinc-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 active:scale-95 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition cursor-pointer"
                >
                  {submitting ? "Scheduling…" : "Schedule Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
