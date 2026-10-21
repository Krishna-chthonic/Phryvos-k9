"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ScrollText,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Settings2,
  X,
  Loader2,
  ChevronRight,
  ShieldCheck,
  FileCode2,
  Check,
  Copy,
  ExternalLink,
} from "lucide-react";
import type { DotDto } from "@/lib/dots-service";

interface RecipeParam {
  name: string;
  description: string;
  default: string;
  required?: boolean;
}

interface RecipeStep {
  name: string;
  prompt: string;
  allowedTools?: string[];
}

interface RecipeSpec {
  id: string;
  name: string;
  description: string;
  category: "quality" | "security" | "devops" | "docs" | "general";
  parameters: RecipeParam[];
  steps: RecipeStep[];
  author?: string;
  isBuiltin?: boolean;
}

interface StepExecResult {
  stepIndex: number;
  stepName: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
  durationMs?: number;
  error?: string;
}

interface RunResult {
  recipeId: string;
  recipeName: string;
  status: "completed" | "failed";
  stepResults: StepExecResult[];
  finalReport: string;
  totalDurationMs: number;
}

interface RecipesPanelProps {
  dot?: DotDto;
}

export function RecipesPanel({ dot }: RecipesPanelProps) {
  const [recipes, setRecipes] = useState<RecipeSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModalRecipe, setActiveModalRecipe] = useState<RecipeSpec | null>(null);
  const [paramInputs, setParamInputs] = useState<Record<string, string>>({});
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadRecipes = useCallback(async () => {
    try {
      const res = await fetch("/api/recipes");
      if (res.ok) {
        const json = await res.json();
        setRecipes(json.recipes || []);
      }
    } catch (err) {
      console.error("Failed to load recipes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecipes();
  }, [loadRecipes]);

  const handleOpenRunModal = (r: RecipeSpec) => {
    setActiveModalRecipe(r);
    const defaults: Record<string, string> = {};
    for (const p of r.parameters) {
      defaults[p.name] = p.default;
    }
    setParamInputs(defaults);
    setErrorMsg(null);
  };

  const handleExecute = async () => {
    if (!activeModalRecipe || executing) return;
    setExecuting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          recipeId: activeModalRecipe.id,
          parameters: paramInputs,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setLastResult(json.result);
        setActiveModalRecipe(null);
      } else {
        setErrorMsg(json.error || "Recipe execution failed.");
      }
    } catch {
      setErrorMsg("Network error executing recipe.");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col h-full overflow-y-auto p-4 sm:p-6 bg-zinc-50/50 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <ScrollText className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Goose Automation Recipes
                </h1>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/40">
                  aaif-goose/goose
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Repeatable multi-step developer operations executed autonomously with surgical step verification.
              </p>
            </div>
          </div>
        </div>

        {/* Latest Execution Report Drawer if present */}
        {lastResult && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/20 p-4.5 dark:bg-emerald-950/20 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-emerald-500/20 mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Recipe Run: {lastResult.recipeName}
                </h3>
                <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                  ({(lastResult.totalDurationMs / 1000).toFixed(1)}s)
                </span>
              </div>
              <button
                onClick={() => setLastResult(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Stepper overview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
              {lastResult.stepResults.map((sr) => (
                <div
                  key={sr.stepIndex}
                  className="rounded-lg border border-zinc-200/60 bg-white/60 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/60"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                      #{sr.stepIndex} {sr.stepName}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        sr.status === "completed" ? "bg-emerald-500" : "bg-red-500"
                      }`}
                    />
                  </div>
                  {sr.durationMs && (
                    <div className="text-[10px] text-zinc-400 font-mono mt-1">
                      ⚡ {(sr.durationMs / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Formatted Report */}
            <div className="rounded-lg border border-zinc-200/60 bg-white p-3.5 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed max-h-[320px] overflow-y-auto">
              {lastResult.finalReport}
            </div>
          </div>
        )}

        {/* Recipes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? (
            <div className="col-span-2 text-center py-12 text-xs text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin inline mr-2 text-amber-500" />
              Loading automation recipes...
            </div>
          ) : (
            recipes.map((r) => (
              <div
                key={r.id}
                className="flex flex-col justify-between rounded-xl border border-zinc-200/80 bg-white p-4.5 shadow-xs transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/80 dark:hover:border-zinc-700"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {r.name}
                        </span>
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {r.category}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-400">
                        id: {r.id}
                      </span>
                    </div>

                    <button
                      onClick={() => handleOpenRunModal(r)}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-500/20 active:scale-95 transition dark:bg-amber-500/20 dark:text-amber-300 cursor-pointer"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      Run Recipe
                    </button>
                  </div>

                  <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {r.description}
                  </p>

                  {/* Steps sequence */}
                  <div className="mt-3 space-y-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800/60">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Recipe Steps ({r.steps.length})
                    </div>
                    {r.steps.map((st, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-mono text-[9px] text-zinc-500 dark:bg-zinc-800">
                          {i + 1}
                        </span>
                        <span className="truncate">{st.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-2.5 text-[10px] text-zinc-400 dark:border-zinc-800/60">
                  <span>Author: {r.author || "Community"}</span>
                  <span className="font-mono">
                    Telegram: /recipe {r.id}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Execution Modal */}
      {activeModalRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Configure Recipe: {activeModalRecipe.name}
              </h3>
              <button
                onClick={() => !executing && setActiveModalRecipe(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800">
                {errorMsg}
              </div>
            )}

            <div className="mt-4 space-y-3">
              {activeModalRecipe.parameters.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  This recipe requires no parameters and will run automatically across its {activeModalRecipe.steps.length} steps.
                </p>
              ) : (
                activeModalRecipe.parameters.map((param) => (
                  <div key={param.name}>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      {param.name}
                    </label>
                    <span className="text-[10px] text-zinc-400">{param.description}</span>
                    <input
                      type="text"
                      value={paramInputs[param.name] ?? param.default}
                      onChange={(e) =>
                        setParamInputs((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-900 focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <button
                onClick={() => setActiveModalRecipe(null)}
                disabled={executing}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleExecute}
                disabled={executing}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 active:scale-95 disabled:opacity-50"
              >
                {executing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current" />
                )}
                {executing ? "Executing Steps..." : "Start Recipe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
