"use client";

import React, { useState, useRef, useEffect } from "react";
import { Zap, Loader2, Sparkles, X } from "lucide-react";

interface TokenRingGaugeProps {
  estTokens: number;
  maxTokens: number;
  percent: number;
  onCompact?: () => void;
  canCompact?: boolean;
  compacting?: boolean;
}

export function TokenRingGauge({
  estTokens,
  maxTokens,
  percent,
  onCompact,
  canCompact,
  compacting,
}: TokenRingGaugeProps) {
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

  const clampedPercent = Math.min(100, Math.max(0, percent));
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedPercent / 100) * circumference;

  const colorClass =
    clampedPercent > 75
      ? "text-red-500 stroke-red-500"
      : clampedPercent > 50
      ? "text-amber-500 stroke-amber-500"
      : "text-emerald-500 stroke-emerald-500";

  const statusLabel =
    clampedPercent > 75
      ? "High Usage"
      : clampedPercent > 50
      ? "Moderate Usage"
      : "Healthy Context";

  const statusDesc =
    clampedPercent > 75
      ? "Memory load is high. Compacting this chat will compress history and keep responses fast."
      : clampedPercent > 50
      ? "Context is growing. Conversation will continue smoothly."
      : "Ample context space available for complex reasoning and tasks.";

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      {/* Tap/Click trigger: Circular gauge ring button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="group relative flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-2xs transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-850"
        title={`Context Usage: ${estTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens (${clampedPercent}%). Tap for details.`}
        aria-label="View token usage"
        aria-expanded={open}
      >
        <svg className="h-6 w-6 -rotate-90 transform" viewBox="0 0 28 28">
          {/* Background circle track */}
          <circle
            cx="14"
            cy="14"
            r={radius}
            fill="transparent"
            strokeWidth="2.5"
            className="stroke-zinc-200 dark:stroke-zinc-800"
          />
          {/* Active progress ring */}
          <circle
            cx="14"
            cy="14"
            r={radius}
            fill="transparent"
            strokeWidth="2.5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`transition-all duration-500 ease-out ${colorClass}`}
          />
        </svg>

        {/* Center icon / indicator */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Zap
            className={`h-2.5 w-2.5 transition-transform duration-200 group-hover:scale-110 ${
              clampedPercent > 75
                ? "text-red-500 animate-pulse"
                : clampedPercent > 50
                ? "text-amber-500"
                : "text-emerald-500"
            }`}
          />
        </div>
      </button>

      {/* Popover Card */}
      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-2xl border border-zinc-200/90 bg-white/95 p-3.5 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-lg ${
                  clampedPercent > 75
                    ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                    : clampedPercent > 50
                    ? "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                    : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Context Window
                </div>
                <div className="text-[10px] font-medium text-zinc-400">
                  {statusLabel}
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="py-2.5 space-y-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-mono text-zinc-600 dark:text-zinc-400">
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                  {estTokens.toLocaleString()}
                </span>{" "}
                / {maxTokens.toLocaleString()} tokens
              </span>
              <span
                className={`text-xs font-bold font-mono ${
                  clampedPercent > 75
                    ? "text-red-600 dark:text-red-400"
                    : clampedPercent > 50
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {clampedPercent}%
              </span>
            </div>

            {/* Horizontal visual meter inside popover */}
            <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  clampedPercent > 75
                    ? "bg-red-500"
                    : clampedPercent > 50
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${clampedPercent}%` }}
              />
            </div>

            <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 pt-0.5">
              {statusDesc}
            </p>
          </div>

          {canCompact && onCompact && (
            <div className="border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCompact();
                }}
                disabled={compacting}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100 active:scale-98 dark:border-zinc-750 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
              >
                {compacting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                ) : (
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                )}
                <span>{compacting ? "Compacting…" : "Compact History Now"}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
