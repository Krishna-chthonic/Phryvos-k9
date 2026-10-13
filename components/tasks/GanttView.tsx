"use client";

import * as React from "react";
import { Gantt, Task, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";
import type { TaskRow } from "@/lib/tracking-service";

interface GanttViewProps {
  tasks: TaskRow[];
  /** pairs: [blockerTaskId, blockedTaskId] — arrow: blocker → blocked */
  depPairs: [number, number][];
  onTaskClick: (task: TaskRow) => void;
}

function toDate(s: string | null | undefined, fallback?: string | null): Date {
  const raw = s ?? fallback;
  if (!raw) return new Date();
  const d = new Date(raw + "T00:00:00");
  return isNaN(d.getTime()) ? new Date() : d;
}

function progressOf(t: TaskRow): number {
  if (t.status === "done") return 100;
  if (t.status === "doing") return 50;
  return 0;
}

function buildDepsMap(pairs: [number, number][]): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  for (const [a, b] of pairs) {
    const sa = String(a);
    const sb = String(b);
    (m[sa] ??= []).push(sb);
  }
  return m;
}

export function GanttChart({ tasks, depPairs, onTaskClick }: GanttViewProps) {
  const depsMap = React.useMemo(() => buildDepsMap(depPairs), [depPairs]);

  const ganttTasks: Task[] = React.useMemo(
    () =>
      tasks.map((t) => ({
        id: String(t.id),
        type: "task" as const,
        name: t.title,
        start: toDate(t.startDate, t.dueDate),
        end: toDate(t.dueDate, t.startDate),
        progress: progressOf(t),
        dependencies: depsMap[String(t.id)] ?? [],
        isDisabled: t.status === "done",
      })),
    [tasks, depsMap],
  );

  return (
    <Gantt
      viewMode={ViewMode.Month}
      tasks={ganttTasks}
      onClick={(task) => {
        const t = tasks.find((x) => String(x.id) === task.id);
        if (t) onTaskClick(t);
      }}
    />
  );
}