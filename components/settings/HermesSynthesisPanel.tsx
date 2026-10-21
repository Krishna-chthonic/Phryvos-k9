"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  BrainCircuit,
  Wrench,
  Code2,
  Sparkles,
  Plus,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileText,
  Sliders,
  Layers,
  Zap,
  TrendingUp,
  Download,
  Loader2,
} from "lucide-react";
import type { SynthesizedTool, ReflectionAnalysis } from "@/lib/hermes/hermes-engine";

export function HermesSynthesisPanel() {
  const [tools, setTools] = useState<SynthesizedTool[]>([]);
  const [reflections, setReflections] = useState<ReflectionAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<"tools" | "synthesize" | "reflections">("tools");

  // Tool synthesis form
  const [toolName, setToolName] = useState("");
  const [toolDesc, setToolDesc] = useState("");
  const [toolCode, setToolCode] = useState("return 'Hello from ' + name + '! Length: ' + name.length;");
  const [paramName, setParamName] = useState("name");
  const [paramType, setParamType] = useState<"string" | "number" | "boolean">("string");
  const [synthesizing, setSynthesizing] = useState(false);

  // Reflection test runner
  const [reflectGoal, setReflectGoal] = useState("Implement AES-256 vault backup rotation");
  const [reflecting, setReflecting] = useState(false);

  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadHermesState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hermes");
      if (res.ok) {
        const json = await res.json();
        if (json.tools) setTools(json.tools);
        if (json.reflections) setReflections(json.reflections);
      }
    } catch (err) {
      console.error("Failed to load Hermes state:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHermesState();
  }, [loadHermesState]);

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toolName.trim() || !toolCode.trim()) return;

    setSynthesizing(true);
    try {
      const res = await fetch("/api/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "synthesize_tool",
          name: toolName.trim(),
          description: toolDesc.trim() || "Dynamic synthesized tool",
          code: toolCode.trim(),
          parameters: [
            {
              name: paramName.trim() || "input",
              type: paramType,
              description: "Input parameter",
              required: true,
            },
          ],
        }),
      });
      const json = await res.json();
      if (json.success) {
        showNotification(
          "success",
          `Synthesized & validated tool [${json.tool?.name}]. Test output: ${json.testOutput}`,
        );
        setToolName("");
        setToolDesc("");
        if (json.tools) setTools(json.tools);
        setSubTab("tools");
      } else {
        showNotification("error", json.error || "Synthesis failed");
      }
    } catch (err) {
      showNotification("error", String(err));
    } finally {
      setSynthesizing(false);
    }
  };

  const handleRunReflection = async () => {
    if (!reflectGoal.trim()) return;
    setReflecting(true);
    try {
      const res = await fetch("/api/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reflect",
          taskGoal: reflectGoal.trim(),
          steps: [
            { tool: "vault_read", resultSnippet: "Read configuration file", success: true },
            { tool: "hermes_synthesize_tool", resultSnippet: "Synthesized backup hasher", success: true },
            { tool: "vault_write", resultSnippet: "Saved encrypted snapshot", success: true },
          ],
        }),
      });
      const json = await res.json();
      if (json.success && json.analysis) {
        showNotification(
          "success",
          `Reflection complete: Alignment ${json.analysis.alignmentScore}%, Efficiency ${json.analysis.efficiencyScore}%`,
        );
        if (json.reflections) setReflections(json.reflections);
      }
    } catch (err) {
      showNotification("error", String(err));
    } finally {
      setReflecting(false);
    }
  };

  const handleExportTrajectory = async () => {
    try {
      const res = await fetch("/api/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export_trajectory" }),
      });
      const json = await res.json();
      if (json.success) {
        showNotification("success", `Exported trajectory to vault: ${json.filePath}`);
      }
    } catch (err) {
      showNotification("error", String(err));
    }
  };

  return (
    <section className="bg-surface rounded-2xl border border-border p-5 space-y-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center border border-orange-500/20">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text flex items-center gap-2">
              Hermes Autonomous Tool Synthesis & Reflection
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 font-mono">
                NousResearch Hermes
              </span>
            </h2>
            <p className="text-xs text-text-muted">
              On-the-fly dynamic skill compilation, trajectory recording, and multi-turn reflection
            </p>
          </div>
        </div>

        <button
          onClick={loadHermesState}
          disabled={loading}
          className="p-2 rounded-lg bg-surface-2 border border-border hover:border-orange-500/30 text-text-muted hover:text-text transition-colors disabled:opacity-50"
          title="Refresh Hermes State"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Overview Metrics Bar */}
      <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-surface-2/60 border border-border text-center">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider text-text-muted">Dynamic Tools</span>
          <p className="text-base font-bold text-text font-mono mt-0.5">{tools.length}</p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider text-text-muted">Reflections</span>
          <p className="text-base font-bold text-orange-400 font-mono mt-0.5">{reflections.length}</p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider text-text-muted">Trajectory Export</span>
          <button
            onClick={handleExportTrajectory}
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 font-mono underline cursor-pointer"
          >
            <Download className="w-3 h-3" />
            <span>Save to Vault</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-tabs */}
      <div className="flex items-center gap-1.5 border-b border-border pb-2 text-xs">
        <button
          onClick={() => setSubTab("tools")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
            subTab === "tools"
              ? "bg-orange-500/10 text-orange-400 font-semibold"
              : "text-text-muted hover:text-text"
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Synthesized Tools ({tools.length})</span>
        </button>

        <button
          onClick={() => setSubTab("synthesize")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
            subTab === "synthesize"
              ? "bg-orange-500/10 text-orange-400 font-semibold"
              : "text-text-muted hover:text-text"
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Synthesize New Tool</span>
        </button>

        <button
          onClick={() => setSubTab("reflections")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
            subTab === "reflections"
              ? "bg-orange-500/10 text-orange-400 font-semibold"
              : "text-text-muted hover:text-text"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Multi-Turn Reflections ({reflections.length})</span>
        </button>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-2.5 rounded-lg text-xs font-medium border flex items-center gap-2 ${
            notification.type === "success"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{notification.text}</span>
        </div>
      )}

      {/* SUBVIEW 1: SYNTHESIZED TOOLS */}
      {subTab === "tools" && (
        <div className="space-y-3">
          {tools.length === 0 ? (
            <div className="p-8 text-center text-xs text-text-muted bg-surface-2/30 rounded-xl border border-dashed border-border">
              No dynamic tools synthesized yet. Use &ldquo;Synthesize New Tool&rdquo; to create on-the-fly skills.
            </div>
          ) : (
            tools.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-xl bg-surface-2/60 border border-border space-y-2 shadow-xs hover:border-orange-500/30 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-mono font-bold text-text">{t.name}</span>
                    <span className="text-[10px] font-mono text-text-muted">
                      ({t.parameters.map((p) => `${p.name}: ${p.type}`).join(", ") || "no args"})
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-text-muted">
                    Executed {t.executionCount} time(s)
                  </span>
                </div>

                <p className="text-xs text-text-muted">{t.description}</p>

                <pre className="text-[11px] font-mono p-2.5 rounded-lg bg-background/80 text-orange-300 overflow-x-auto max-h-24">
                  {t.code}
                </pre>
              </div>
            ))
          )}
        </div>
      )}

      {/* SUBVIEW 2: SYNTHESIZE TOOL FORM */}
      {subTab === "synthesize" && (
        <form onSubmit={handleSynthesize} className="p-4 rounded-xl bg-surface-2/40 border border-border space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-mono text-text-muted block mb-1">Tool Function Name</label>
              <input
                type="text"
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                placeholder="e.g. string_reverse_hash"
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-1 text-xs text-text font-mono outline-none focus:border-orange-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-text-muted block mb-1">Description</label>
              <input
                type="text"
                value={toolDesc}
                onChange={(e) => setToolDesc(e.target.value)}
                placeholder="What this dynamic tool does"
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-1 text-xs text-text outline-none focus:border-orange-500/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-mono text-text-muted block mb-1">Parameter Name</label>
              <input
                type="text"
                value={paramName}
                onChange={(e) => setParamName(e.target.value)}
                placeholder="name"
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-1 text-xs text-text font-mono outline-none focus:border-orange-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-text-muted block mb-1">Parameter Type</label>
              <select
                value={paramType}
                onChange={(e) => setParamType(e.target.value as any)}
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-1 text-xs text-text font-mono outline-none"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-mono text-text-muted block mb-1">
              JavaScript Implementation Body (sandboxed VM)
            </label>
            <textarea
              value={toolCode}
              onChange={(e) => setToolCode(e.target.value)}
              rows={4}
              className="w-full bg-surface border border-border rounded-lg p-2.5 text-xs text-text font-mono outline-none focus:border-orange-500/50 leading-relaxed"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={synthesizing || !toolName.trim() || !toolCode.trim()}
              className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {synthesizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              <span>Validate & Register Dynamic Tool</span>
            </button>
          </div>
        </form>
      )}

      {/* SUBVIEW 3: MULTI-TURN REFLECTIONS */}
      {subTab === "reflections" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-2/40 border border-border">
            <input
              type="text"
              value={reflectGoal}
              onChange={(e) => setReflectGoal(e.target.value)}
              placeholder="Target objective for reflection review..."
              className="flex-1 bg-surface border border-border rounded-lg px-2.5 py-1 text-xs text-text font-mono outline-none focus:border-orange-500/50"
            />
            <button
              onClick={handleRunReflection}
              disabled={reflecting || !reflectGoal.trim()}
              className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {reflecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              <span>Run Reflection</span>
            </button>
          </div>

          {reflections.length === 0 ? (
            <div className="p-8 text-center text-xs text-text-muted bg-surface-2/30 rounded-xl border border-dashed border-border">
              No reflection analyses recorded yet.
            </div>
          ) : (
            reflections.map((refl) => (
              <div
                key={refl.id}
                className="p-4 rounded-xl bg-surface-2/60 border border-border space-y-2.5 shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-semibold text-text truncate">
                      Task: &ldquo;{refl.targetTask}&rdquo;
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                      Alignment: {refl.alignmentScore}%
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">
                      Efficiency: {refl.efficiencyScore}%
                    </span>
                  </div>
                </div>

                <p className="text-xs text-text-muted font-sans leading-relaxed">{refl.reflectionSummary}</p>

                {refl.recommendedRules.length > 0 && (
                  <div className="text-[11px] font-mono text-orange-300 pt-1">
                    💡 Improvement Takeaway: {refl.recommendedRules.join("; ")}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
