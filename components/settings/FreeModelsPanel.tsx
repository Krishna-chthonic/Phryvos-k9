"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Check,
  Loader2,
  Layers,
  Terminal,
  Cpu,
  BrainCircuit,
  ShieldCheck,
} from "lucide-react";

interface GatewayStatus {
  id: string;
  name: string;
  baseUrl: string;
  status: "online" | "degraded" | "offline";
  latencyMs: number;
  lastChecked: number;
}

interface FreeModel {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  description: string;
  recommendedRole: string;
  capabilities: string[];
}

interface StatusPayload {
  gateways: GatewayStatus[];
  models: FreeModel[];
  providerId: number;
  isDefault: boolean;
}

export function FreeModelsPanel() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testModel, setTestModel] = useState("deepseek-chat");
  const [testPrompt, setTestPrompt] = useState("Give me a concise 1-sentence tip on writing clean code.");
  const [testResult, setTestResult] = useState<{ reply: string; latencyMs: number } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/free/status");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load free models status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleEnableDefault = async () => {
    setEnabling(true);
    setMessage(null);
    try {
      const res = await fetch("/api/ai/free/enable", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: json.message || "Set as active default AI provider!" });
        await loadStatus();
      } else {
        setMessage({ type: "error", text: json.error || "Failed to set as default provider." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Network error enabling free provider." });
    } finally {
      setEnabling(false);
    }
  };

  const handleRunTest = async () => {
    if (!testPrompt.trim() || testing) return;
    setTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const res = await fetch("/api/ai/free/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: testModel, prompt: testPrompt }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setTestResult({ reply: json.reply, latencyMs: json.latencyMs });
      } else {
        setTestError(json.error || "Model test generation failed.");
      }
    } catch (err) {
      setTestError("Network error running test generation.");
    } finally {
      setTesting(false);
    }
  };

  const copyCurl = () => {
    const curl = `curl http://localhost:3000/api/ai/free/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${testModel}","messages":[{"role":"user","content":"Hello!"}]}'`;
    navigator.clipboard.writeText(curl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white/60 p-5 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/60">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800/80">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Zero-Config Free Frontier Models
              </h2>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40">
                dsh-our-free-model
              </span>
              {data?.isDefault && (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/20">
                  Active Default
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              No API keys or credit cards required. Powered by multi-lane upstream public gateways with automatic fallback cascading.
            </p>
          </div>
        </div>

        <button
          onClick={handleEnableDefault}
          disabled={enabling || data?.isDefault}
          className={`flex items-center gap-2 self-start sm:self-auto rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            data?.isDefault
              ? "bg-zinc-100 text-zinc-500 cursor-default dark:bg-zinc-800 dark:text-zinc-400"
              : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm active:scale-95"
          }`}
        >
          {enabling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : data?.isDefault ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          {data?.isDefault ? "Active as Default" : "Set as Active Provider"}
        </button>
      </div>

      {message && (
        <div
          className={`mt-4 rounded-lg p-3 text-xs ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
              : "bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200 border border-red-200 dark:border-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Upstream Gateways Health & Latency */}
      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mb-2.5">
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          Upstream Gateway Health & Multi-Lane Latency
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {loading ? (
            <div className="col-span-3 text-center py-4 text-xs text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Pinging public model gateways...
            </div>
          ) : (
            data?.gateways.map((gw) => (
              <div
                key={gw.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200/70 bg-zinc-50/50 p-2.5 dark:border-zinc-800/80 dark:bg-zinc-800/40"
              >
                <div>
                  <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    {gw.name}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate max-w-[140px]">
                    {gw.baseUrl}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      gw.status === "online"
                        ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        : gw.status === "degraded"
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                  />
                  <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {gw.latencyMs < 9000 ? `${gw.latencyMs}ms` : "timeout"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Model Roster */}
      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mb-2.5">
          <Layers className="h-3.5 w-3.5 text-indigo-500" />
          Included Frontier Model Roster
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {data?.models.map((m) => (
            <div
              key={m.id}
              onClick={() => setTestModel(m.id)}
              className={`cursor-pointer rounded-lg border p-3 transition ${
                testModel === m.id
                  ? "border-indigo-500/70 bg-indigo-50/40 dark:border-indigo-500/50 dark:bg-indigo-950/20"
                  : "border-zinc-200/70 bg-zinc-50/30 hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-800/20 dark:hover:border-zinc-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {m.id}
                  </span>
                  <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                    ({m.name})
                  </span>
                </div>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {Math.round(m.contextWindow / 1024)}k ctx
                </span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-2">
                {m.description}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {m.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    #{cap}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Test & Playground */}
      <div className="mt-5 rounded-lg border border-zinc-200/80 bg-zinc-50/50 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-950/40">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Interactive Test Playground
            </span>
          </div>
          <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400">
            Model: {testModel}
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="Type a test prompt..."
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            onClick={handleRunTest}
            disabled={testing || !testPrompt.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run Test
          </button>
        </div>

        {testResult && (
          <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-50/30 p-3 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                Response Received
              </span>
              <span className="font-mono text-[10px] text-zinc-500">
                ⚡ {testResult.latencyMs}ms
              </span>
            </div>
            <p className="text-xs text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
              {testResult.reply}
            </p>
          </div>
        )}

        {testError && (
          <div className="mt-3 rounded-lg border border-red-500/20 bg-red-50/40 p-2.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {testError}
          </div>
        )}
      </div>

      {/* Local OpenAI Proxy Forwarding Endpoint */}
      <div className="mt-5 rounded-lg border border-zinc-200/80 bg-zinc-900 p-3 text-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-semibold font-mono text-zinc-200">
              Local OpenAI Forwarding Proxy
            </span>
          </div>
          <button
            onClick={copyCurl}
            className="flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-700"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy cURL"}
          </button>
        </div>
        <div className="font-mono text-[11px] text-emerald-400 bg-zinc-950/60 p-2 rounded border border-zinc-800 truncate">
          http://localhost:3000/api/ai/free/v1/chat/completions
        </div>
        <p className="mt-1.5 text-[10px] text-zinc-400">
          Drop this endpoint into any CLI agent, Aider, Goose, or Python script. Zero authentication required.
        </p>
      </div>
    </div>
  );
}
