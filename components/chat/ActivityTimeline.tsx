"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  FileCode,
  Search,
  Calculator,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActivityStep {
  step: number;
  toolCallId?: string;
  tool: string;
  args?: Record<string, any>;
  result?: any;
  approval?: any;
  durationMs?: number;
  status?: "running" | "success" | "denied" | "failed";
}

interface ActivityTimelineProps {
  steps: ActivityStep[];
  className?: string;
  defaultExpanded?: boolean;
}

export function ActivityTimeline({
  steps,
  className,
  defaultExpanded = false,
}: ActivityTimelineProps) {
  const [isTimelineOpen, setIsTimelineOpen] = useState(defaultExpanded);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});

  if (!steps || steps.length === 0) return null;

  const toggleStep = (stepNum: number) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepNum]: !prev[stepNum],
    }));
  };

  const getToolIcon = (tool: string) => {
    const t = tool.toLowerCase();
    if (t.includes("terminal") || t.includes("bash") || t.includes("exec")) {
      return <Terminal className="w-3.5 h-3.5 text-amber-400" />;
    }
    if (t.includes("file") || t.includes("write") || t.includes("read")) {
      return <FileCode className="w-3.5 h-3.5 text-cyan-400" />;
    }
    if (t.includes("search") || t.includes("vault") || t.includes("fetch")) {
      return <Search className="w-3.5 h-3.5 text-blue-400" />;
    }
    if (t.includes("calc") || t.includes("math")) {
      return <Calculator className="w-3.5 h-3.5 text-emerald-400" />;
    }
    if (t.includes("approval")) {
      return <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />;
    }
    return <Wrench className="w-3.5 h-3.5 text-neutral-400" />;
  };

  const getStatusBadge = (step: ActivityStep) => {
    const status = step.status || (step.result ? "success" : "running");
    switch (status) {
      case "running":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">
            <Loader2 className="w-3 h-3 animate-spin" />
            Running
          </span>
        );
      case "denied":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
            <XCircle className="w-3 h-3" />
            Denied
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
            <XCircle className="w-3 h-3" />
            Failed
          </span>
        );
      case "success":
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
            <CheckCircle2 className="w-3 h-3" />
            Success
          </span>
        );
    }
  };

  const totalDuration = steps.reduce((acc, s) => acc + (s.durationMs || 0), 0);

  return (
    <div
      className={cn(
        "my-2 rounded-lg border border-neutral-800 bg-neutral-900/40 text-xs overflow-hidden transition-all",
        className,
      )}
    >
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsTimelineOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900/60 hover:bg-neutral-800/60 text-neutral-300 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          {isTimelineOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />
          )}
          <span className="font-medium text-neutral-200">
            Agent Activity Timeline ({steps.length} {steps.length === 1 ? "step" : "steps"})
          </span>
        </div>

        {totalDuration > 0 && (
          <div className="flex items-center gap-1 text-[11px] font-mono text-neutral-400">
            <Clock className="w-3 h-3" />
            <span>{totalDuration}ms</span>
          </div>
        )}
      </button>

      {/* Expanded Steps List */}
      {isTimelineOpen && (
        <div className="divide-y divide-neutral-800/60 border-t border-neutral-800">
          {steps.map((step) => {
            const isStepOpen = !!expandedSteps[step.step];
            const hasDetails = step.args || step.result;

            return (
              <div key={step.step} className="p-2.5 hover:bg-neutral-900/30 transition-colors">
                <div
                  className={cn(
                    "flex items-center justify-between gap-2",
                    hasDetails && "cursor-pointer select-none",
                  )}
                  onClick={() => hasDetails && toggleStep(step.step)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-4 h-4 rounded-full bg-neutral-800 flex items-center justify-center text-[10px] font-mono text-neutral-400 shrink-0">
                      {step.step}
                    </span>
                    <span className="shrink-0">{getToolIcon(step.tool)}</span>
                    <span className="font-mono font-medium text-neutral-200 truncate">
                      {step.tool}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {step.durationMs !== undefined && (
                      <span className="text-[10px] font-mono text-neutral-500">
                        {step.durationMs}ms
                      </span>
                    )}
                    {getStatusBadge(step)}
                    {hasDetails && (
                      <span className="text-neutral-500 hover:text-neutral-300">
                        {isStepOpen ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Inspectable Args and Result */}
                {isStepOpen && hasDetails && (
                  <div className="mt-2 pl-6 space-y-2 text-[11px] font-mono">
                    {step.args && Object.keys(step.args).length > 0 && (
                      <div className="rounded bg-neutral-950 p-2 border border-neutral-800/80">
                        <div className="text-[10px] text-neutral-500 mb-1 font-semibold uppercase">
                          Parameters
                        </div>
                        <pre className="text-neutral-300 whitespace-pre-wrap overflow-x-auto max-h-36">
                          {JSON.stringify(step.args, null, 2)}
                        </pre>
                      </div>
                    )}

                    {step.result && (
                      <div className="rounded bg-neutral-950 p-2 border border-neutral-800/80">
                        <div className="text-[10px] text-neutral-500 mb-1 font-semibold uppercase">
                          Result
                        </div>
                        <pre className="text-emerald-400 whitespace-pre-wrap overflow-x-auto max-h-48">
                          {typeof step.result === "string"
                            ? step.result
                            : JSON.stringify(step.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
