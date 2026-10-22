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
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  MousePointer,
  Loader2,
  Search,
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

  // OpenBrowser State (ntegrals/openbrowser) & Tencent BrowserSkill
  const [browserUrl, setBrowserUrl] = useState("https://en.wikipedia.org/wiki/Autonomous_agent");
  const [browserSession, setBrowserSession] = useState<any>(null);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserViewTab, setBrowserViewTab] = useState<"dom" | "text" | "telemetry">("dom");
  const [telemetry, setTelemetry] = useState<{ consoleLogs: any[]; networkLogs: any[] }>({ consoleLogs: [], networkLogs: [] });

  // Live Filesystem & Activity State
  const [realFiles, setRealFiles] = useState<Array<{ name: string; isDir: boolean; size?: string }>>([]);
  const [currentSubpath, setCurrentSubpath] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [recentActivities, setRecentActivities] = useState<Array<{ id: string; action: string; time: string; detail: string }>>([]);

  const currentWorkspaceDir = React.useMemo(() => {
    if (!currentSubpath) return dot.workingDirectory;
    const cleanSub = currentSubpath.replace(/\.\./g, "").replace(/^\/+/, "");
    return `${dot.workingDirectory.replace(/\/+$/, "")}/${cleanSub}`;
  }, [dot.workingDirectory, currentSubpath]);

  const loadRealFiles = React.useCallback(async () => {
    setLoadingFiles(true);
    try {
      const res = await fetch(`/api/dots/${dot.id}/terminal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "ls -la", cwd: currentWorkspaceDir }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.stdout) {
          const lines = data.stdout.split("\n");
          const items = lines
            .map((l: string) => {
              const parts = l.trim().split(/\s+/);
              if (parts.length < 9) return null;
              const perms = parts[0];
              const size = parts[4];
              const name = parts.slice(8).join(" ");
              if (!name || name === "." || name === "..") return null;
              return {
                name,
                isDir: perms.startsWith("d"),
                size: perms.startsWith("d") ? "Directory" : `${size} B`,
              };
            })
            .filter((x: any): x is { name: string; isDir: boolean; size: string } => Boolean(x));
          setRealFiles(items);
        }
      }
    } catch {} finally {
      setLoadingFiles(false);
    }
  }, [dot.id, currentWorkspaceDir]);

  const loadActivities = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/dots/${dot.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages) {
          const toolMsgs = data.messages
            .filter((m: any) => m.role === "tool" || m.toolName)
            .slice(-12)
            .reverse()
            .map((m: any) => ({
              id: m.id,
              action: m.toolName ? `Executed: ${m.toolName}` : "Shell command",
              time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              detail: m.content.slice(0, 120),
            }));
          setRecentActivities(toolMsgs);
        }
      }
    } catch {}
  }, [dot.id]);

  React.useEffect(() => {
    if (tab === "Files") {
      void loadRealFiles();
    } else if (tab === "Activity") {
      void loadActivities();
    }
  }, [tab, loadRealFiles, loadActivities]);

  const loadBrowserSession = React.useCallback(async () => {
    try {
      const [resSession, resTelemetry] = await Promise.all([
        fetch(`/api/browser?session=${dot.id}`),
        fetch(`/api/browser/skill`),
      ]);
      if (resSession.ok) {
        const json = await resSession.json();
        setBrowserSession(json.session);
        if (json.session.currentUrl && json.session.currentUrl !== "about:blank") {
          setBrowserUrl(json.session.currentUrl);
        }
      }
      if (resTelemetry.ok) {
        const json = await resTelemetry.json();
        setTelemetry({ consoleLogs: json.consoleLogs || [], networkLogs: json.networkLogs || [] });
      }
    } catch {}
  }, [dot.id]);

  React.useEffect(() => {
    if (tab === "Browser") {
      void loadBrowserSession();
    }
  }, [tab, loadBrowserSession]);

  const handleBrowserNavigate = async (urlToNav?: string) => {
    const target = urlToNav || browserUrl.trim();
    if (!target || browserLoading) return;
    setBrowserLoading(true);
    try {
      const res = await fetch(`/api/browser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: dot.id, action: "navigate", url: target }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setBrowserSession(json.session);
        setBrowserUrl(json.session.currentUrl);
      }
    } catch {} finally {
      setBrowserLoading(false);
    }
  };

  const handleBrowserClick = async (elementId: number) => {
    setBrowserLoading(true);
    try {
      const res = await fetch(`/api/browser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: dot.id, action: "click", elementId }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setBrowserSession(json.session);
        setBrowserUrl(json.session.currentUrl);
      }
    } catch {} finally {
      setBrowserLoading(false);
    }
  };

  const handleBrowserBack = async () => {
    setBrowserLoading(true);
    try {
      const res = await fetch(`/api/browser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: dot.id, action: "goBack" }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setBrowserSession(json.session);
        setBrowserUrl(json.session.currentUrl);
      }
    } catch {} finally {
      setBrowserLoading(false);
    }
  };

  const handleRunCommand = async (cmdToRun?: string) => {
    const cmd = cmdToRun || command.trim();
    if (!cmd || running) return;

    setRunning(true);

    // Tencent BrowserSkill CLI interception
    if (cmd.startsWith("bsk") || cmd.startsWith("./bsk")) {
      try {
        const res = await fetch("/api/browser/skill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: cmd, sessionId: dot.id }),
        });
        const data = await res.json();
        const outputText = data.output || (data.success ? "✔ Done" : `❌ ${data.error}`);
        setOutput((prev) => `${prev ? prev + "\n\n" : ""}$ ${cmd}\n${outputText}`);
        if (!cmdToRun) setCommand("");
        void loadBrowserSession();
        return;
      } catch (e) {
        setOutput((prev) => `${prev ? prev + "\n\n" : ""}$ ${cmd}\n❌ Error: ${e instanceof Error ? e.message : "Execution failed"}`);
        return;
      } finally {
        setRunning(false);
      }
    }

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
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-zinc-500 truncate max-w-[200px] sm:max-w-none" title={currentWorkspaceDir}>
                  {currentSubpath ? `…/${currentSubpath}` : dot.workingDirectory}
                </span>
                {currentSubpath && (
                  <button
                    onClick={() => {
                      setCurrentSubpath((prev) => {
                        const parts = prev.split("/").filter(Boolean);
                        parts.pop();
                        return parts.join("/");
                      });
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
                    title="Go up one folder"
                  >
                    .. Up
                  </button>
                )}
                <button
                  onClick={() => void loadRealFiles()}
                  disabled={loadingFiles}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                  title="Refresh filesystem"
                >
                  <RotateCcw className={`h-3 w-3 ${loadingFiles ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {loadingFiles ? (
              <div className="py-8 flex items-center justify-center text-zinc-500 gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                <span>Reading directory tree...</span>
              </div>
            ) : realFiles.length === 0 ? (
              <div className="py-8 text-center text-zinc-500">
                Directory is empty or not yet initialized. Use the terminal tab to run commands.
              </div>
            ) : (
              <div className="space-y-1.5 font-mono text-zinc-400 text-xs max-h-[340px] overflow-y-auto">
                {realFiles.map((f) => (
                  <div
                    key={f.name}
                    onClick={() => {
                      if (f.isDir) {
                        setCurrentSubpath((prev) => (prev ? `${prev}/${f.name}` : f.name));
                      } else {
                        setTab("Terminal");
                        handleRunCommand(`cat "${f.name}"`);
                      }
                    }}
                    className="flex items-center justify-between p-2 rounded-xl bg-zinc-800/40 hover:bg-zinc-800/80 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2 text-zinc-200 truncate">
                      {f.isDir ? (
                        <Folder className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                      ) : (
                        <Code2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span className="truncate">{f.name}</span>
                    </span>
                    <span className="text-[10px] text-zinc-500 shrink-0">{f.size}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Browser" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4 text-xs">
            {/* Browser Address Bar */}
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
              <button
                onClick={handleBrowserBack}
                disabled={browserLoading}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 transition cursor-pointer"
                title="Go Back"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleBrowserNavigate()}
                disabled={browserLoading}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-800/40 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 transition cursor-pointer"
                title="Reload"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${browserLoading ? "animate-spin text-sky-400" : ""}`} />
              </button>

              <div className="relative flex-1">
                <Globe className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBrowserNavigate()}
                  placeholder="https://..."
                  className="w-full h-8 rounded-lg border border-zinc-800 bg-zinc-950/70 pl-8 pr-3 text-xs text-zinc-100 font-mono outline-none focus:border-sky-500"
                />
              </div>

              <button
                onClick={() => handleBrowserNavigate()}
                disabled={browserLoading || !browserUrl.trim()}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40 transition cursor-pointer"
              >
                {browserLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                Navigate
              </button>
            </div>

            {/* Page Header Bar */}
            {browserSession && (
              <div className="flex items-center justify-between bg-zinc-950/50 p-2.5 rounded-xl border border-zinc-800">
                <div className="truncate max-w-md">
                  <div className="font-semibold text-zinc-200 text-xs truncate">
                    {browserSession.title || "Untitled Page"}
                  </div>
                  <div className="font-mono text-[10px] text-zinc-500 truncate">
                    {browserSession.currentUrl}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
                    <button
                      onClick={() => setBrowserViewTab("dom")}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${
                        browserViewTab === "dom" ? "bg-zinc-800 text-sky-400" : "text-zinc-500"
                      }`}
                    >
                      Elements ({browserSession.interactiveElements?.length || 0})
                    </button>
                    <button
                      onClick={() => setBrowserViewTab("text")}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${
                        browserViewTab === "text" ? "bg-zinc-800 text-sky-400" : "text-zinc-500"
                      }`}
                    >
                      Page Text
                    </button>
                    <button
                      onClick={() => setBrowserViewTab("telemetry")}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${
                        browserViewTab === "telemetry" ? "bg-zinc-800 text-sky-400" : "text-zinc-500"
                      }`}
                    >
                      Telemetry ({telemetry.networkLogs.length + telemetry.consoleLogs.length})
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* View Tab 1: Interactive Elements Tree */}
            {browserViewTab === "dom" && (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {(!browserSession || !browserSession.interactiveElements?.length) ? (
                  <div className="text-center py-8 text-zinc-500 text-xs">
                    No active interactive elements. Navigate to a URL above.
                  </div>
                ) : (
                  browserSession.interactiveElements.map((el: any) => (
                    <div
                      key={el.id}
                      className="flex items-center justify-between p-2 rounded-lg border border-zinc-800/60 bg-zinc-950/40 hover:bg-zinc-900/60 transition"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="font-mono text-[10px] font-bold text-sky-400 bg-sky-950/50 px-1.5 py-0.5 rounded border border-sky-800/40">
                          #{el.id}
                        </span>
                        <span className="font-mono text-[9px] uppercase px-1 py-0.2 rounded bg-zinc-800 text-zinc-400">
                          {el.tag}
                        </span>
                        <span className="text-xs text-zinc-200 truncate">
                          {el.text || el.name || el.placeholder || el.href}
                        </span>
                      </div>

                      {el.tag === "a" || el.tag === "button" ? (
                        <button
                          onClick={() => handleBrowserClick(el.id)}
                          disabled={browserLoading}
                          className="flex items-center gap-1 rounded bg-zinc-800 hover:bg-zinc-700 px-2 py-0.5 text-[10px] font-mono text-zinc-300 hover:text-white transition shrink-0 cursor-pointer"
                        >
                          <MousePointer className="h-2.5 w-2.5 text-sky-400" /> Click
                        </button>
                      ) : (
                        <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                          {el.value ? `="${el.value}"` : "[editable]"}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* View Tab 2: Clean Page Text */}
            {browserViewTab === "text" && (
              <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/40 text-xs text-zinc-300 font-sans whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto">
                {browserSession?.pageTextSnippet || "No page text loaded."}
              </div>
            )}

            {/* View Tab 3: Tencent BrowserSkill Network & Console Telemetry */}
            {browserViewTab === "telemetry" && (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {/* Network requests */}
                <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-400 mb-2">
                    Network Traffic ({telemetry.networkLogs.length})
                  </div>
                  <div className="space-y-1 font-mono text-[10px]">
                    {telemetry.networkLogs.length === 0 ? (
                      <div className="text-zinc-500">No network requests captured yet.</div>
                    ) : (
                      telemetry.networkLogs.slice(0, 8).map((net: any) => (
                        <div key={net.id} className="flex items-center justify-between p-1 rounded bg-zinc-900/40 text-zinc-300">
                          <div className="flex items-center gap-1.5 truncate pr-2">
                            <span className="font-bold text-sky-400">{net.method}</span>
                            <span className={`px-1 rounded text-[9px] ${net.status === 200 ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"}`}>
                              {net.status}
                            </span>
                            <span className="truncate">{net.url}</span>
                          </div>
                          <span className="text-zinc-500 shrink-0">{net.durationMs}ms</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Console logs */}
                <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 mb-2">
                    Console Logs ({telemetry.consoleLogs.length})
                  </div>
                  <div className="space-y-1 font-mono text-[10px]">
                    {telemetry.consoleLogs.length === 0 ? (
                      <div className="text-zinc-500">No console output.</div>
                    ) : (
                      telemetry.consoleLogs.slice(0, 8).map((c: any) => (
                        <div key={c.id} className="p-1 rounded bg-zinc-900/40 text-zinc-300 flex items-start gap-1.5">
                          <span className={`uppercase font-bold text-[9px] px-1 rounded shrink-0 ${
                            c.level === "error" ? "bg-red-950 text-red-400" : c.level === "warn" ? "bg-amber-950 text-amber-400" : "bg-zinc-800 text-zinc-400"
                          }`}>
                            {c.level}
                          </span>
                          <span className="truncate">{c.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "Activity" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-400" />
                <span className="font-semibold text-zinc-200">Execution Activity Timeline</span>
              </div>
              <button
                onClick={() => void loadActivities()}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                title="Refresh activity"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            </div>

            <div className="space-y-2 text-zinc-400 max-h-[340px] overflow-y-auto">
              {recentActivities.length === 0 ? (
                <div className="py-6 text-center text-zinc-500">
                  No tool execution events recorded yet. Assign a task or send a command to see live telemetry.
                </div>
              ) : (
                recentActivities.map((act) => (
                  <div key={act.id} className="flex items-start gap-2.5 p-2 rounded-xl bg-zinc-800/40">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-zinc-200 font-semibold truncate">{act.action}</span>
                        <span className="text-[10px] text-zinc-500 font-mono shrink-0">{act.time}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate">{act.detail}</p>
                    </div>
                  </div>
                ))
              )}

              <div className="flex items-start gap-2.5 p-2 rounded-xl bg-zinc-800/20 border border-zinc-800/50">
                <CheckCircle2 className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-zinc-300 font-medium">{dot.name} environment provisioned</div>
                  <div className="text-[10px] text-zinc-500 font-mono">{dot.workingDirectory}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
