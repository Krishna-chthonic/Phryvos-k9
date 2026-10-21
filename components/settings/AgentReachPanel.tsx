"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Globe2,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  Video,
  Code2,
  MessageSquare,
  Rss,
  Share2,
  FileText,
} from "lucide-react";

interface DoctorChannel {
  name: string;
  channel: "web" | "github" | "reddit" | "youtube" | "twitter" | "rss";
  status: "healthy" | "degraded" | "offline";
  latencyMs: number;
  detail?: string;
}

interface DoctorReport {
  timestamp: number;
  channels: DoctorChannel[];
  allHealthy: boolean;
}

export function AgentReachPanel() {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [loadingDoctor, setLoadingDoctor] = useState(true);
  const [activeChannel, setActiveChannel] = useState<"web" | "github" | "reddit" | "youtube" | "twitter" | "rss">("web");
  const [targetInput, setTargetInput] = useState("https://en.wikipedia.org/wiki/Artificial_intelligence");
  const [fetching, setFetching] = useState(false);
  const [reachOutput, setReachOutput] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadDoctor = useCallback(async () => {
    setLoadingDoctor(true);
    try {
      const res = await fetch("/api/reach/doctor");
      if (res.ok) {
        const json = await res.json();
        setReport(json.report);
      }
    } catch (err) {
      console.error("Failed to load doctor report:", err);
    } finally {
      setLoadingDoctor(false);
    }
  }, []);

  useEffect(() => {
    void loadDoctor();
  }, [loadDoctor]);

  const handleChannelSelect = (ch: typeof activeChannel) => {
    setActiveChannel(ch);
    setReachOutput(null);
    setErrorMsg(null);
    switch (ch) {
      case "web":
        setTargetInput("https://en.wikipedia.org/wiki/Artificial_intelligence");
        break;
      case "github":
        setTargetInput("torvalds/linux");
        break;
      case "reddit":
        setTargetInput("r/technology");
        break;
      case "youtube":
        setTargetInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        break;
      case "twitter":
        setTargetInput("https://twitter.com/jack/status/20");
        break;
      case "rss":
        setTargetInput("https://news.ycombinator.com/rss");
        break;
    }
  };

  const handleReach = async () => {
    if (!targetInput.trim() || fetching) return;
    setFetching(true);
    setReachOutput(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/reach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: activeChannel,
          target: targetInput.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setReachOutput(json.data);
      } else {
        setErrorMsg(json.error || "Reach extraction failed.");
      }
    } catch {
      setErrorMsg("Network error contacting reach service.");
    } finally {
      setFetching(false);
    }
  };

  const copyResult = () => {
    if (!reachOutput) return;
    const text = typeof reachOutput === "string" ? reachOutput : JSON.stringify(reachOutput, null, 2);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white/60 p-5 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/60">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800/80">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400">
            <Globe2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Agent-Reach Multi-Channel Intelligence
              </h2>
              <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-200/50 dark:border-cyan-800/40">
                Panniantong/Agent-Reach
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Zero-fee, zero-key public web reach across Web, GitHub, Reddit, YouTube, Twitter/X, and RSS.
            </p>
          </div>
        </div>

        <button
          onClick={loadDoctor}
          disabled={loadingDoctor}
          className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition"
        >
          {loadingDoctor ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Run Doctor Diagnostics
        </button>
      </div>

      {/* Doctor Channels Health Grid */}
      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mb-2.5">
          <Activity className="h-3.5 w-3.5 text-cyan-500" />
          Doctor Diagnostic Channel Health
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {loadingDoctor && !report ? (
            <div className="col-span-6 text-center py-4 text-xs text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Checking reach channels...
            </div>
          ) : (
            report?.channels.map((ch) => (
              <div
                key={ch.channel}
                className="flex flex-col justify-between rounded-lg border border-zinc-200/70 bg-zinc-50/50 p-2 dark:border-zinc-800 dark:bg-zinc-800/30"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                    {ch.channel}
                  </span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      ch.status === "healthy"
                        ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        : ch.status === "degraded"
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                  />
                </div>
                <div className="font-mono text-[10px] text-zinc-500 mt-1">
                  ⚡ {ch.latencyMs}ms
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Interactive Reach Playground */}
      <div className="mt-5 rounded-lg border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-800/80 dark:bg-zinc-950/40">
        <div className="flex flex-wrap items-center gap-1.5 mb-3 border-b border-zinc-200/60 pb-2.5 dark:border-zinc-800/60">
          {[
            { id: "web", label: "Clean Web Reader", icon: Globe2 },
            { id: "github", label: "GitHub", icon: Code2 },
            { id: "reddit", label: "Reddit", icon: MessageSquare },
            { id: "youtube", label: "YouTube Captions", icon: Video },
            { id: "twitter", label: "Twitter / X", icon: Share2 },
            { id: "rss", label: "RSS Feed", icon: Rss },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSel = activeChannel === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleChannelSelect(tab.id as any)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  isSel
                    ? "bg-white text-zinc-900 shadow-xs font-semibold dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            placeholder="Enter URL, repository, or subreddit..."
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 focus:border-cyan-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 font-mono"
          />
          <button
            onClick={handleReach}
            disabled={fetching || !targetInput.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50 active:scale-95 transition"
          >
            {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Reach & Extract
          </button>
        </div>

        {errorMsg && (
          <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        {reachOutput && (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Extracted Data Output
              </span>
              <button
                onClick={copyResult}
                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="font-mono text-xs text-zinc-700 dark:text-zinc-300 max-h-[300px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {typeof reachOutput === "string" ? reachOutput : JSON.stringify(reachOutput, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
