"use client";

import React, { useState } from "react";
import {
  Terminal,
  Folder,
  Globe,
  Clock,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Code2,
} from "lucide-react";
import type { DotDto } from "@/lib/dots-service";

interface DotComputerPanelProps {
  dot: DotDto;
}

export function DotComputerPanel({ dot }: DotComputerPanelProps) {
  const [tab, setTab] = useState<"Terminal" | "Files" | "Browser" | "Activity">("Terminal");
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRunCommand = async (cmdToRun?: string) => {
    const cmd = cmdToRun || command.trim();
    if (!cmd || running) return;

    setRunning(true);
    try {
      const res = await fetch(`/api/dots/${dot.id}/terminal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, cwd: dot.workingDirectory }),
      });
      const data = await res.json();
      const outputText = data.stdout || data.stderr || (data.exitCode === 0 ? "✔ Done (no output)" : "❌ Command failed");
      setOutput((prev) => `${prev ? prev + "\n\n" : ""}$ ${cmd}\n${outputText}`);
      if (!cmdToRun) setCommand("");
    } catch (e) {
      setOutput((prev) => `${prev ? prev + "\n\n" : ""}$ ${cmd}\n❌ Error: ${e instanceof Error ? e.message : "Execution failed"}`);
    } finally {
      setRunning(false);
    }
  };

  const copyOutput = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* Top Computer Header Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-xs font-semibold tracking-wide text-zinc-200">
              {dot.name}’s Virtual Environment
            </span>
          </div>
          <span className="hidden sm:inline-block font-mono text-[11px] text-zinc-500 truncate max-w-xs">
            {dot.workingDirectory}
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 rounded-xl bg-zinc-800/80 p-1 border border-zinc-700/60 text-xs">
          {(["Terminal", "Files", "Browser", "Activity"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                tab === t
                  ? "bg-zinc-700 text-white shadow-xs font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === "Terminal" && (
          <div className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-black/90 shadow-2xl overflow-hidden font-mono text-xs">
            {/* Terminal Window Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3.5 py-2 select-none">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-2 font-mono text-[11px] text-zinc-400">bash — interactive takeover</span>
              </div>
              <div className="flex items-center gap-2">
                {output && (
                  <button
                    onClick={copyOutput}
                    className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                )}
                {output && (
                  <button
                    onClick={() => setOutput("")}
                    className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-zinc-200"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Terminal Output Area */}
            <div className="flex-1 min-h-[220px] overflow-y-auto p-4 font-mono text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap select-text">
              {output ? (
                output
              ) : (
                <div className="text-zinc-600">
                  Phryvos Virtual Supervisor attached to {dot.workingDirectory}
                  {"\n"}Ready for command execution or human takeover.
                  {"\n"}Type a command below or tap a quick action.
                </div>
              )}
            </div>

            {/* Quick Command Suggestions */}
            <div className="flex flex-wrap gap-1.5 border-t border-zinc-900 bg-zinc-950/60 p-2 text-[11px]">
              {["git status", "ls -la", "pwd", "node -v", "npm list --depth=0"].map((qc) => (
                <button
                  key={qc}
                  disabled={running}
                  onClick={() => handleRunCommand(qc)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
                >
                  {qc}
                </button>
              ))}
            </div>

            {/* Terminal Input Bar */}
            <div className="flex items-center border-t border-zinc-800 bg-zinc-900 px-3 py-2">
              <span className="text-emerald-400 font-bold mr-2 text-xs">$</span>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleRunCommand();
                  }
                }}
                disabled={running}
                placeholder="Type command and press Enter (Human Takeover)…"
                className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-zinc-600 font-mono"
              />
              <button
                onClick={() => handleRunCommand()}
                disabled={running || !command.trim()}
                className="ml-2 flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
              >
                <Play className="h-3 w-3" />
                <span>Run</span>
              </button>
            </div>
          </div>
        )}

        {tab === "Files" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-amber-400" />
                <span className="font-semibold text-zinc-200">Workspace Files</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-500">{dot.workingDirectory}</span>
            </div>
            <div className="space-y-2 font-mono text-zinc-400 text-xs">
              <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-800/40 hover:bg-zinc-800/70 cursor-pointer">
                <span className="flex items-center gap-2 text-zinc-200">
                  <Folder className="h-3.5 w-3.5 text-sky-400" /> src/
                </span>
                <span className="text-[10px] text-zinc-500">Directory</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-800/40 hover:bg-zinc-800/70 cursor-pointer">
                <span className="flex items-center gap-2 text-zinc-200">
                  <Folder className="h-3.5 w-3.5 text-sky-400" /> docs/
                </span>
                <span className="text-[10px] text-zinc-500">Directory</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-800/40 hover:bg-zinc-800/70 cursor-pointer">
                <span className="flex items-center gap-2 text-zinc-200">
                  <Code2 className="h-3.5 w-3.5 text-emerald-400" /> package.json
                </span>
                <span className="text-[10px] text-zinc-500">File</span>
              </div>
            </div>
          </div>
        )}

        {tab === "Browser" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-center text-xs text-zinc-400 space-y-2">
            <Globe className="h-8 w-8 text-sky-400 mx-auto" />
            <h3 className="font-semibold text-zinc-200 text-sm">Autonomous Web Navigator</h3>
            <p className="text-zinc-500 max-w-sm mx-auto leading-relaxed">
              When {dot.name} runs web search or fetches primary sources, inspected URLs and synthesized page extracts will appear here.
            </p>
          </div>
        )}

        {tab === "Activity" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
              <Clock className="h-4 w-4 text-emerald-400" />
              <span className="font-semibold text-zinc-200">Activity Timeline</span>
            </div>
            <div className="space-y-2 text-zinc-400">
              <div className="flex items-start gap-2.5 p-2 rounded-xl bg-zinc-800/30">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-zinc-200 font-medium">{dot.name} initialized</div>
                  <div className="text-[10px] text-zinc-500">Virtual environment provisioned at {dot.workingDirectory}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
