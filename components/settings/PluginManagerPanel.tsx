"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Boxes,
  Shield,
  Activity,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Trash2,
  Clock,
  Terminal,
  AlertTriangle,
  FileText,
  Zap,
  Loader2,
  Layers,
} from "lucide-react";

interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  category: "safety" | "memory" | "tools" | "gateway" | "workflow" | "core";
  enabled: boolean;
  author?: string;
  isCore: boolean;
  hookTypes: string[];
}

interface AuditTrace {
  id: string;
  sessionId?: string;
  dotName?: string;
  stepNumber: number;
  timestamp: number;
  phase: "prompt" | "thinking" | "tool_call" | "tool_result" | "completion" | "safety_block";
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolResultSnippet?: string;
  thinkingSnippet?: string;
  durationMs?: number;
}

export function PluginManagerPanel() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [traces, setTraces] = useState<AuditTrace[]>([]);
  const [activeTab, setActiveTab] = useState<"plugins" | "audit">("plugins");
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [resPlugins, resTraces] = await Promise.all([
        fetch("/api/plugins"),
        fetch("/api/plugins/audit?limit=30"),
      ]);

      if (resPlugins.ok) {
        const json = await resPlugins.json();
        setPlugins(json.plugins || []);
      }
      if (resTraces.ok) {
        const json = await resTraces.json();
        setTraces(json.traces || []);
      }
    } catch (err) {
      console.error("Failed to load plugins / audit data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggle = async (plugin: PluginInfo) => {
    if (plugin.isCore || togglingId) return;
    setTogglingId(plugin.id);
    setErrorMsg(null);

    const nextState = !plugin.enabled;
    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pluginId: plugin.id, enabled: nextState }),
      });

      if (res.ok) {
        setPlugins((prev) =>
          prev.map((p) => (p.id === plugin.id ? { ...p, enabled: nextState } : p)),
        );
      } else {
        const json = await res.json();
        setErrorMsg(json.error || "Failed to toggle plugin.");
      }
    } catch {
      setErrorMsg("Network error updating plugin state.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleClearAudit = async () => {
    try {
      await fetch("/api/plugins/audit", { method: "DELETE" });
      setTraces([]);
    } catch {}
  };

  const activeCount = plugins.filter((p) => p.enabled).length;

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white/60 p-5 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/60">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800/80">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                DeepSeek Harness Plugin Chassis
              </h2>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800/40">
                Everything is a Plugin
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Cordis modular chassis: dynamically orchestrates tools, PII masking, safety hooks, and execution audit trails.
            </p>
          </div>
        </div>

        {/* View Switcher */}
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-100/70 p-0.5 dark:border-zinc-700 dark:bg-zinc-800/60 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab("plugins")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              activeTab === "plugins"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Plugins ({activeCount}/{plugins.length})
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              activeTab === "audit"
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Audit Log ({traces.length})
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800">
          {errorMsg}
        </div>
      )}

      {/* Tab 1: Installed Plugins */}
      {activeTab === "plugins" && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {loading ? (
            <div className="col-span-2 text-center py-6 text-xs text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Loading plugin registry...
            </div>
          ) : (
            plugins.map((plugin) => (
              <div
                key={plugin.id}
                className={`rounded-lg border p-3.5 transition ${
                  plugin.enabled
                    ? "border-zinc-200/80 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/40"
                    : "border-zinc-200/40 bg-zinc-100/40 opacity-60 dark:border-zinc-800/40 dark:bg-zinc-900/20"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {plugin.name}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        v{plugin.version}
                      </span>
                      {plugin.isCore && (
                        <span className="rounded bg-zinc-200/70 px-1.5 py-0.2 font-mono text-[9px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          core
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {plugin.description}
                    </p>
                  </div>

                  <button
                    onClick={() => handleToggle(plugin)}
                    disabled={plugin.isCore || togglingId === plugin.id}
                    title={plugin.isCore ? "Core plugin cannot be disabled" : "Toggle plugin"}
                    className={`shrink-0 transition ${
                      plugin.isCore
                        ? "cursor-not-allowed opacity-40 text-emerald-600"
                        : plugin.enabled
                        ? "text-emerald-500 hover:text-emerald-400"
                        : "text-zinc-400 hover:text-zinc-500"
                    }`}
                  >
                    {togglingId === plugin.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : plugin.enabled ? (
                      <ToggleRight className="h-6 w-6" />
                    ) : (
                      <ToggleLeft className="h-6 w-6" />
                    )}
                  </button>
                </div>

                {/* Hook badges */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1">
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    category: {plugin.category}
                  </span>
                  {plugin.hookTypes.map((hk) => (
                    <span
                      key={hk}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      #{hk}
                    </span>
                  ))}
                  {plugin.author && (
                    <span className="text-[9px] text-zinc-400 ml-auto font-mono">
                      by @{plugin.author}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Execution Audit Log */}
      {activeTab === "audit" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Verifiable step-by-step audit trail for all AI coworker actions.
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={loadData}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </button>
              {traces.length > 0 && (
                <button
                  onClick={handleClearAudit}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {traces.length === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-500 border border-dashed border-zinc-200 rounded-lg dark:border-zinc-800">
                No recent agent execution steps recorded in this session. Run a chat or task to see live audit logs.
              </div>
            ) : (
              traces.map((trace) => (
                <div
                  key={trace.id}
                  className="rounded-lg border border-zinc-200/70 bg-zinc-50/40 p-2.5 text-xs dark:border-zinc-800/80 dark:bg-zinc-950/40"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase ${
                          trace.phase === "tool_call"
                            ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                            : trace.phase === "tool_result"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : trace.phase === "safety_block"
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {trace.phase}
                      </span>
                      {trace.toolName && (
                        <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          {trace.toolName}
                        </span>
                      )}
                      {trace.stepNumber > 0 && (
                        <span className="text-[10px] text-zinc-400 font-mono">
                          (step #{trace.stepNumber})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-400">
                      {trace.durationMs !== undefined && (
                        <span>⚡ {trace.durationMs}ms</span>
                      )}
                      <span>{new Date(trace.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  {trace.toolArgs && Object.keys(trace.toolArgs).length > 0 && (
                    <div className="mt-1 font-mono text-[10px] text-zinc-500 bg-white/60 dark:bg-zinc-900/60 p-1.5 rounded border border-zinc-200/50 dark:border-zinc-800/50 truncate">
                      args: {JSON.stringify(trace.toolArgs)}
                    </div>
                  )}

                  {trace.toolResultSnippet && (
                    <div className="mt-1 text-[11px] text-zinc-700 dark:text-zinc-300 bg-zinc-100/50 dark:bg-zinc-900/30 p-1.5 rounded font-mono truncate">
                      {trace.toolResultSnippet}
                    </div>
                  )}

                  {trace.thinkingSnippet && (
                    <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400 italic">
                      {trace.thinkingSnippet}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
