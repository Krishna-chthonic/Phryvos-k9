"use client";

import React from "react";
import {
  Brain,
  Globe,
  GraduationCap,
  PenTool,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import {
  EFFORT_PRESETS,
  MODE_PRESETS,
  type EffortLevel,
  type AiMode,
} from "@/lib/ai/modes-and-effort";
import type { ModeAndEffortBarProps } from "./types";

export function ModeAndEffortBar({
  mode,
  onModeChange,
  effort,
  onEffortChange,
  disabled,
}: ModeAndEffortBarProps) {
  const currentEffort = EFFORT_PRESETS[effort] ?? EFFORT_PRESETS.medium;

  return (
    <div className="mb-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
        {/* Mode chips */}
        <div className="flex items-center gap-1.5 min-w-max">
          {(Object.keys(MODE_PRESETS) as AiMode[]).map((mKey) => {
            const m = MODE_PRESETS[mKey];
            const isActive = mode === mKey;
            const Icon =
              mKey === "thinking"
                ? Brain
                : mKey === "flash"
                ? Zap
                : mKey === "research"
                ? Globe
                : mKey === "coding"
                ? Terminal
                : mKey === "creative"
                ? PenTool
                : mKey === "study"
                ? GraduationCap
                : Sparkles;

            return (
              <button
                key={mKey}
                type="button"
                disabled={disabled}
                onClick={() => onModeChange(mKey)}
                title={m.description}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                  isActive
                    ? "bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 dark:bg-zinc-800/80 dark:text-zinc-400 dark:hover:bg-zinc-700/60"
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 ${
                    isActive ? "text-emerald-400 dark:text-emerald-600" : ""
                  }`}
                />
                <span>{m.shortName}</span>
                {mKey === "thinking" && (
                  <span className="hidden sm:inline text-[10px] opacity-75">
                    5-15m
                  </span>
                )}
                {mKey === "research" && (
                  <span className="hidden sm:inline text-[10px] opacity-75">
                    2h Auto
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Effort level dropdown */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 hidden sm:inline">
            Effort:
          </span>
          <select
            value={effort}
            disabled={disabled}
            onChange={(e) => onEffortChange(e.target.value as EffortLevel)}
            className="h-7 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 outline-none cursor-pointer"
            title={currentEffort.description}
          >
            {(Object.keys(EFFORT_PRESETS) as EffortLevel[]).map((eKey) => {
              const eff = EFFORT_PRESETS[eKey];
              return (
                <option key={eKey} value={eKey}>
                  {eff.badge} ({eff.name.replace(" Effort", "")})
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Mode active hint banner */}
      {(mode === "research" ||
        mode === "thinking" ||
        effort === "ultra" ||
        effort === "xhigh") && (
        <div className="flex items-center justify-between rounded-xl px-2.5 py-1 text-[11px] font-medium transition bg-zinc-50 border border-zinc-200/70 text-zinc-600 dark:bg-zinc-900/60 dark:border-zinc-800/60 dark:text-zinc-400">
          <div className="flex items-center gap-1.5 truncate">
            {mode === "research" ? (
              <>
                <Globe className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="truncate">
                  <strong className="text-blue-600 dark:text-blue-400 font-semibold">
                    Autonomous Deep Research:
                  </strong>{" "}
                  Up to 2 hours runtime · Pre-approved tool & skill execution ·
                  Massive synthesis saved to vault
                </span>
              </>
            ) : mode === "thinking" ? (
              <>
                <Brain className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span className="truncate">
                  <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    Extended Reasoning:
                  </strong>{" "}
                  5 to 15 minutes deliberation window for complex logic & math
                </span>
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="truncate">
                  <strong className="text-amber-600 dark:text-amber-400 font-semibold">
                    {currentEffort.name}:
                  </strong>{" "}
                  High token budget (
                  {currentEffort.thinkingBudget.toLocaleString()} tokens) & deep
                  multi-step loops
                </span>
              </>
            )}
          </div>
          <span className="text-[10px] font-mono text-zinc-400 ml-2 shrink-0">
            {currentEffort.badge}
          </span>
        </div>
      )}
    </div>
  );
}
