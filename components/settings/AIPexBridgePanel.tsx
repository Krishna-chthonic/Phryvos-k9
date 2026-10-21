"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Monitor,
  Radio,
  Layers,
  Play,
  Plus,
  Trash2,
  ExternalLink,
  Code2,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  Terminal,
} from "lucide-react";

interface BrowserTab {
  id: number;
  title: string;
  url: string;
  active: boolean;
  lastAccessed: number;
}

interface BridgeStatus {
  status: "listening" | "connected" | "idle";
  connectedClients: number;
  activeTabId: number | null;
  totalTabs: number;
  endpoint: string;
  mcpMounted: boolean;
}

export function AIPexBridgePanel() {
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [newTabUrl, setNewTabUrl] = useState("");
  const [evalCode, setEvalCode] = useState("document.title");
  const [evalResult, setEvalResult] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [copiedMcp, setCopiedMcp] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/aipex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "aipex_list_tabs", arguments: {} },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const rawContent = json.result?.content?.[0]?.text;
        if (rawContent) {
          const parsed = JSON.parse(rawContent);
          setTabs(parsed || []);
        }
      }

      setStatus({
        status: "listening",
        connectedClients: 1,
        activeTabId: tabs.find((t) => t.active)?.id || null,
        totalTabs: tabs.length,
        endpoint: "http://localhost:3000/api/mcp/aipex",
        mcpMounted: true,
      });
    } catch (err) {
      console.error("Failed to load AIPex tabs:", err);
    } finally {
      setLoading(false);
    }
  }, [tabs.length]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSwitchTab = async (tabId: number) => {
    try {
      await fetch("/api/mcp/aipex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: { name: "aipex_switch_tab", arguments: { tabId } },
        }),
      });
      await loadData();
    } catch {}
  };

  const handleCloseTab = async (tabId: number) => {
    try {
      await fetch("/api/mcp/aipex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: { name: "aipex_close_tab", arguments: { tabId } },
        }),
      });
      await loadData();
    } catch {}
  };

  const handleNewTab = async () => {
    if (!newTabUrl.trim()) return;
    try {
      await fetch("/api/mcp/aipex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: { name: "aipex_new_tab", arguments: { url: newTabUrl.trim() } },
        }),
      });
      setNewTabUrl("");
      await loadData();
    } catch {}
  };

  const handleEval = async () => {
    const active = tabs.find((t) => t.active) || tabs[0];
    if (!active || !evalCode.trim() || evaluating) return;

    setEvaluating(true);
    setEvalResult(null);

    try {
      const res = await fetch("/api/mcp/aipex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: "aipex_eval_script",
            arguments: { tabId: active.id, code: evalCode.trim() },
          },
        }),
      });

      const json = await res.json();
      const raw = json.result?.content?.[0]?.text;
      setEvalResult(raw || "Execution finished.");
    } catch (e) {
      setEvalResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEvaluating(false);
    }
  };

  const copyMcpConfig = () => {
    const cfg = {
      mcpServers: {
        aipex: {
          url: "http://localhost:3000/api/mcp/aipex",
          type: "http",
        },
      },
    };
    navigator.clipboard.writeText(JSON.stringify(cfg, null, 2));
    setCopiedMcp(true);
    setTimeout(() => setCopiedMcp(false), 2000);
  };

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white/60 p-5 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/60">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800/80">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400">
            <Monitor className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                AIPex Real Browser Bridge & MCP
              </h2>
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200/50 dark:border-violet-800/40">
                AIPexStudio/AIPex
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Connects AI agents directly to your real browser session, active logins, and open tabs via local MCP daemon.
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh Tabs
        </button>
      </div>

      {/* Status Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50/80 p-2.5 dark:bg-zinc-800/30 border border-zinc-200/60 dark:border-zinc-800/60">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            AIPex Daemon Active
          </span>
          <span className="font-mono text-[10px] text-zinc-400">
            (JSON-RPC 2.0 at /api/mcp/aipex)
          </span>
        </div>

        <button
          onClick={copyMcpConfig}
          className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
        >
          {copiedMcp ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          {copiedMcp ? "Copied MCP Config" : "Copy MCP Config for Claude/Cursor"}
        </button>
      </div>

      {/* Connected Browser Tabs */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-violet-500" />
            Connected Browser Tabs ({tabs.length})
          </h3>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newTabUrl}
              onChange={(e) => setNewTabUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNewTab()}
              placeholder="https://..."
              className="h-7 w-44 rounded-md border border-zinc-200 bg-white px-2 text-[11px] text-zinc-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 font-mono"
            />
            <button
              onClick={handleNewTab}
              disabled={!newTabUrl.trim()}
              className="flex h-7 items-center gap-1 rounded-md bg-violet-600 px-2 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
              New Tab
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center justify-between p-2.5 rounded-lg border transition ${
                tab.active
                  ? "border-violet-500/60 bg-violet-50/40 dark:border-violet-500/40 dark:bg-violet-950/20"
                  : "border-zinc-200/70 bg-zinc-50/40 hover:bg-zinc-100/50 dark:border-zinc-800/60 dark:bg-zinc-900/40"
              }`}
            >
              <div className="flex items-center gap-2 truncate pr-2">
                <span className="font-mono text-[10px] text-zinc-400">
                  #{tab.id}
                </span>
                {tab.active && (
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />
                )}
                <div className="truncate">
                  <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {tab.title}
                  </div>
                  <div className="font-mono text-[10px] text-zinc-500 truncate">
                    {tab.url}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {!tab.active && (
                  <button
                    onClick={() => handleSwitchTab(tab.id)}
                    className="rounded bg-zinc-200/70 px-2 py-0.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition"
                  >
                    Focus
                  </button>
                )}
                <button
                  onClick={() => handleCloseTab(tab.id)}
                  className="rounded p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                  title="Close tab"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Script Evaluation Console */}
      <div className="mt-5 rounded-lg border border-zinc-200/80 bg-zinc-50/50 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-950/40">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-violet-500" />
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              In-Tab JavaScript Evaluator
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">
            Targeting active tab: #{tabs.find((t) => t.active)?.id || "None"}
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={evalCode}
            onChange={(e) => setEvalCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEval()}
            placeholder="e.g. document.title or window.location.href"
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-violet-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 font-mono"
          />
          <button
            onClick={handleEval}
            disabled={evaluating || !evalCode.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {evaluating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
            Evaluate
          </button>
        </div>

        {evalResult && (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-2.5 font-mono text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            <span className="text-violet-500 font-semibold mr-1.5">=&gt;</span>
            {evalResult}
          </div>
        )}
      </div>
    </div>
  );
}
