"use client";

import * as React from "react";
import { Clock, Tag, AlertTriangle } from "lucide-react";
import type { TaskRow } from "@/lib/tracking-service";

interface TaskCardProps {
  task: TaskRow;
  onClick: (task: TaskRow) => void;
  blockedCount: number;
}

const PRIORITY_COLOR: Record<number, string> = {
  0: "bg-zinc-400",
  1: "bg-blue-500",
  2: "bg-amber-500",
  3: "bg-red-500",
};

export function TaskCard({ task, onClick, blockedCount }: TaskCardProps) {
  const color = PRIORITY_COLOR[task.priority] ?? "bg-zinc-400";
  const isDone = task.status === "done";
  const isDoing = task.status === "doing";

  return (
    <div
      onClick={() => onClick(task)}
      className={`group relative bg-white rounded-lg border p-3 shadow-sm transition-all cursor-pointer ${
        isDone
          ? "opacity-60 border-zinc-200 bg-zinc-50"
          : "border-zinc-200 hover:border-zinc-300 hover:shadow-md"
      }`}
    >
      <div className="flex items-start gap-2">
        <div
          className={`flex-shrink-0 w-1.5 h-6 rounded-full ${color}`}
          title={`Priority: ${task.priority}`}
        />
        <div className="flex-1 min-w-0">
          <h4
            className={`text-sm font-medium truncate ${
              isDone ? "line-through text-zinc-500" : "text-zinc-900"
            }`}
          >
            {task.title}
          </h4>
          {task.description && (
            <p className="mt-1 text-xs text-zinc-500 line-clamp-2">
              {task.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            {task.dueDate && (
              <span
                className={`flex items-center gap-1 ${
                  new Date(task.dueDate) < new Date() && !isDone
                    ? "text-red-500"
                    : ""
                }`}
              >
                <Clock className="h-3 w-3" />
                {task.dueDate}
              </span>
            )}
            {task.tags.length > 0 && (
              <span className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {task.tags.slice(0, 2).join(", ")}
                {task.tags.length > 2 && ` +${task.tags.length - 2}`}
              </span>
            )}
            {blockedCount > 0 && (
              <span
                className="flex items-center gap-1 text-amber-600"
                title={`${blockedCount} task(s) blocked by this`}
              >
                <AlertTriangle className="h-3 w-3" />
                {blockedCount}
              </span>
            )}
          </div>
        </div>
        {isDoing && (
          <span className="flex-shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
            In Progress
          </span>
        )}
        {isDone && (
          <span className="flex-shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
            Done
          </span>
        )}
      </div>
    </div>
  );
}