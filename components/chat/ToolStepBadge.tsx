"use client";

import React, { useState } from "react";
import {
  Brain,
  Calculator,
  Search,
  Globe,
  Wrench,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { StepEvt } from "./types";

export function toolBadge(name: string): {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
} {
  switch (name) {
    case "save_memory":
      return { label: "Saved to Memory", icon: Brain };
    case "list_memories":
      return { label: "Recalled Memories", icon: Brain };
    case "delete_memory":
      return { label: "Forgot Memory", icon: Brain };
    case "calculate":
      return { label: "Calculated", icon: Calculator };
    case "web_search":
      return { label: "Web Search", icon: Search };
    case "web_fetch":
      return { label: "Fetched Webpage", icon: Globe };
    default:
      return { label: name, icon: Wrench };
  }
}

export function ToolStepBadge({ s }: { s: StepEvt }) {
  const [open, setOpen] = useState(false);
  const badge = toolBadge(s.tool);
  const Icon = badge.icon;
  const argSummary =
    typeof s.args === "object" && s.args !== null
      ? Object.entries(s.args)
          .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join(", ")
      : "";

  return (
    <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/70 p-2 text-xs dark:border-zinc-800/80 dark:bg-zinc-900/60 transition">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 text-left cursor-pointer"
      >
        <div className="flex items-center gap-1.5 truncate">
          <Icon className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {badge.label}
          </span>
          {argSummary && (
            <span className="truncate text-[11px] text-zinc-500 font-mono">
              ({argSummary})
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 border-t border-zinc-200/60 pt-2 text-[11px] font-mono dark:border-zinc-800/60">
          <div>
            <span className="text-zinc-400 select-none">Args: </span>
            <span className="text-zinc-700 dark:text-zinc-300">
              {JSON.stringify(s.args, null, 2)}
            </span>
          </div>
          <div>
            <span className="text-zinc-400 select-none">Result: </span>
            <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-100 p-1.5 text-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-200">
              {s.result}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
