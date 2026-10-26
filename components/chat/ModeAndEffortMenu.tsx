"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  Brain,
  Globe,
  Zap,
  Terminal,
  PenTool,
  GraduationCap,
  Sparkles,
  Check,
  X,
  Gauge,
} from "lucide-react";
import {
  EFFORT_PRESETS,
  MODE_PRESETS,
  type EffortLevel,
  type AiMode,
} from "@/lib/ai/modes-and-effort";

interface ModeAndEffortMenuProps {
  mode: AiMode;
  onModeChange: (mode: AiMode) => void;
  effort: EffortLevel;
  onEffortChange: (effort: EffortLevel) => void;
  disabled?: boolean;
}

export function ModeAndEffortMenu({
  mode,
  onModeChange,
  effort,
  onEffortChange,
  disabled,
}: ModeAndEffortMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  const currentMode = MODE_PRESETS[mode] ?? MODE_PRESETS.thinking;
  const currentEffort = EFFORT_PRESETS[effort] ?? EFFORT_PRESETS.medium;
  const isCustom = mode !== "thinking" || effort !== "medium";

  const getModeIcon = (mKey: AiMode) => {
    switch (mKey) {
      case "thinking":
        return Brain;
      case "research":
        return Globe;
      case "flash":
        return Zap;
      case "coding":
        return Terminal;
      case "creative":
        return PenTool;
      case "study":
        return GraduationCap;
      default:
        return Sparkles;
    }
  };

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      {/* Plus (+) Button right next to file upload icon */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        title={`AI Mode: ${currentMode.name} (${currentEffort.name} effort). Tap to configure.`}
        aria-label="Configure AI Mode and Reasoning Effort"
        aria-expanded={open}
        className={`group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-95 disabled:opacity-40 ${
          open
            ? "bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-900"
            : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        }`}
      >
        <Plus
          className={`h-4 w-4 transition-transform duration-200 ${
            open ? "rotate-45" : "group-hover:scale-110"
          }`}
        />
        {/* Subtle active indicator dot if a specialized mode or effort is selected */}
        {isCustom && !open && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" />
        )}
      </button>

      {/* Floating Popover Menu */}
      {open && (
        <div className="absolute bottom-12 left-0 z-50 w-80 max-w-[88vw] rounded-2xl border border-zinc-200/90 bg-white/95 p-3.5 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  AI Mode & Effort
                </div>
                <div className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  {currentMode.name} · {currentEffort.name}
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Section 1: AI Modes */}
          <div className="pt-2.5">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Select AI Mode
            </div>
            <div className="space-y-1">
              {(Object.keys(MODE_PRESETS) as AiMode[]).map((mKey) => {
                const m = MODE_PRESETS[mKey];
                const isActive = mode === mKey;
                const Icon = getModeIcon(mKey);

                return (
                  <button
                    key={mKey}
                    type="button"
                    onClick={() => onModeChange(mKey)}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs transition cursor-pointer ${
                      isActive
                        ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-850"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                          isActive
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium leading-tight">
                          {m.name}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {mKey === "research"
                            ? "Autonomous web deep dive (2h)"
                            : mKey === "thinking"
                            ? "Deliberative reasoning (5-15m)"
                            : m.description}
                        </div>
                      </div>
                    </div>
                    {isActive && (
                      <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 ml-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Reasoning Effort */}
          <div className="mt-3 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
            <div className="mb-1.5 flex items-center justify-between text-[10px]">
              <span className="font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Reasoning Effort
              </span>
              <span className="font-medium text-zinc-500 dark:text-zinc-400">
                {currentEffort.name}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1">
              {(Object.keys(EFFORT_PRESETS) as EffortLevel[]).map((eKey) => {
                const eff = EFFORT_PRESETS[eKey];
                const isActive = effort === eKey;

                return (
                  <button
                    key={eKey}
                    type="button"
                    onClick={() => onEffortChange(eKey)}
                    className={`rounded-lg px-2 py-1.5 text-center text-[11px] font-medium transition cursor-pointer ${
                      isActive
                        ? "bg-zinc-900 text-white font-semibold shadow-xs dark:bg-zinc-100 dark:text-zinc-900"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {eff.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">
              {currentEffort.description}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
