"use client";

import React, { useState, useRef, useEffect } from "react";
import { Zap, X, Cpu, Clock, Layers, Sparkles } from "lucide-react";
import type { TurnTelemetry } from "@/lib/ai/types";

export interface TurnRouteInspectorProps {
  telemetry: TurnTelemetry;
}

export function TurnRouteInspector({ telemetry }: TurnRouteInspectorProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const totalTokens =
    telemetry.totalTokens ??
    ((telemetry.promptTokens ?? 0) + (telemetry.completionTokens ?? 0) || undefined);

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium tracking-tight bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 transition-colors cursor-pointer select-none"
        aria-label="Inspect turn route telemetry"
        title="View turn latency, model routing, and token metrics"
      >
        <Zap className="w-3 h-3 text-amber-500 fill-amber-500/20" />
        <span>{telemetry.latencyMs}ms</span>
        <span className="opacity-40">·</span>
        <span className="truncate max-w-[120px]">{telemetry.model}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Turn Telemetry Details"
          className="absolute z-30 left-0 bottom-full mb-2 w-72 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl text-xs text-slate-700 dark:text-slate-200 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 font-semibold">
            <span className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              Turn Telemetry
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close telemetry inspector"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Latency:
              </span>
              <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                {telemetry.latencyMs} ms
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Cpu className="w-3 h-3" /> Model / Provider:
              </span>
              <span className="font-mono text-slate-900 dark:text-slate-100 truncate max-w-[140px]">
                {telemetry.model} ({telemetry.provider})
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Layers className="w-3 h-3" /> Finish Reason:
              </span>
              <span className="font-mono px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {telemetry.finishReason}
              </span>
            </div>

            {(telemetry.promptTokens !== undefined || telemetry.completionTokens !== undefined) && (
              <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-1">
                <div className="flex justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                  <span>Prompt Tokens:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {telemetry.promptTokens?.toLocaleString() ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                  <span>Completion Tokens:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {telemetry.completionTokens?.toLocaleString() ?? "—"}
                  </span>
                </div>
                {totalTokens !== undefined && (
                  <div className="flex justify-between font-semibold pt-1 text-[11px] text-slate-900 dark:text-slate-100">
                    <span>Total Tokens:</span>
                    <span className="font-mono">{totalTokens.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
