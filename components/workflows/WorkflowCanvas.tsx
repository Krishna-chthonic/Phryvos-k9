"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  RotateCw,
  Plus,
  Save,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Video,
  Mic,
  Share2,
  Terminal,
  Send,
  Globe,
  Settings,
  Layers,
  FileCode,
  ArrowRight,
  Eye,
  Check,
} from "lucide-react";
import type { Workflow, WorkflowNode, WorkflowEdge, WorkflowNodeType } from "@/lib/workflows/workflow-types";

interface WorkflowCanvasProps {
  initialWorkflows: Workflow[];
}

const NODE_META: Partial<Record<WorkflowNodeType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; badge: string }>> = {
  trigger_schedule: { label: "Schedule Trigger", icon: Clock, color: "border-amber-500/60 bg-amber-950/20 text-amber-400", badge: "Trigger" },
  trigger_manual: { label: "Manual Trigger", icon: Play, color: "border-amber-500/60 bg-amber-950/20 text-amber-400", badge: "Trigger" },
  trigger_webhook: { label: "Webhook Trigger", icon: Globe, color: "border-amber-500/60 bg-amber-950/20 text-amber-400", badge: "Trigger" },
  ai_script: { label: "AI Script Writer", icon: Sparkles, color: "border-purple-500/60 bg-purple-950/20 text-purple-400", badge: "AI Brain" },
  ai_video_gen: { label: "AI Video Generator", icon: Video, color: "border-rose-500/60 bg-rose-950/20 text-rose-400", badge: "Media" },
  ai_tts_voice: { label: "Voiceover (TTS)", icon: Mic, color: "border-pink-500/60 bg-pink-950/20 text-pink-400", badge: "Audio" },
  ffmpeg_stitch: { label: "FFmpeg Assembly", icon: Layers, color: "border-indigo-500/60 bg-indigo-950/20 text-indigo-400", badge: "Render" },
  youtube_publish: { label: "YouTube Uploader", icon: Share2, color: "border-red-500/60 bg-red-950/20 text-red-400", badge: "Social" },
  telegram_notify: { label: "Telegram Push Alert", icon: Send, color: "border-sky-500/60 bg-sky-950/20 text-sky-400", badge: "Alert" },
  bash_script: { label: "Bash / Terminal", icon: Terminal, color: "border-emerald-500/60 bg-emerald-950/20 text-emerald-400", badge: "Code" },
  web_scrape: { label: "Web Scraper / Reach", icon: Globe, color: "border-cyan-500/60 bg-cyan-950/20 text-cyan-400", badge: "Data" },
};

export function WorkflowCanvas({ initialWorkflows }: WorkflowCanvasProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>(initialWorkflows);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(initialWorkflows[0]?.id || "");
  const [isRunning, setIsRunning] = useState(false);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<Array<{ timestamp: string; text: string; type: "info" | "success" | "error" }>>([]);

  const activeWorkflow = workflows.find((w) => w.id === selectedWorkflowId) || workflows[0];
  const [nodes, setNodes] = useState<WorkflowNode[]>(activeWorkflow?.nodes || []);
  const [edges, setEdges] = useState<WorkflowEdge[]>(activeWorkflow?.edges || []);

  useEffect(() => {
    if (activeWorkflow) {
      setNodes(activeWorkflow.nodes);
      setEdges(activeWorkflow.edges);
    }
  }, [selectedWorkflowId]);

  // Execute workflow
  const handleRunWorkflow = async () => {
    if (!activeWorkflow || isRunning) return;
    setIsRunning(true);
    setExecutionLogs((prev) => [
      { timestamp: new Date().toLocaleTimeString(), text: `Starting execution of "${activeWorkflow.name}"...`, type: "info" },
      ...prev,
    ]);

    // Animate nodes to running state sequentially
    try {
      const res = await fetch(`/api/workflows/${activeWorkflow.id}/run`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.ok) {
        setNodes(data.nodes || nodes);
        setExecutionLogs((prev) => [
          { timestamp: new Date().toLocaleTimeString(), text: `✔ Flow completed successfully! All steps executed.`, type: "success" },
          ...prev,
        ]);
      } else {
        setExecutionLogs((prev) => [
          { timestamp: new Date().toLocaleTimeString(), text: `✖ Execution failed: ${JSON.stringify(data.errors)}`, type: "error" },
          ...prev,
        ]);
      }
    } catch (err: any) {
      setExecutionLogs((prev) => [
        { timestamp: new Date().toLocaleTimeString(), text: `Network error running workflow: ${err.message}`, type: "error" },
        ...prev,
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  // Node position helper for SVG wires
  const getNodeCenter = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    return {
      x: node.position.x + 110, // Approximate width center
      y: node.position.y + 45,  // Approximate height center
    };
  };

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans select-none">
      {/* Top Studio Control Bar */}
      <div className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-wide">Flow Automation Studio</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                Visual DAG Canvas
              </span>
            </div>
            <p className="text-xs text-zinc-400 hidden sm:block">
              Build autonomous AI pipelines, YouTube auto-publishers & channel bots
            </p>
          </div>
        </div>

        {/* Workflow Template Selector & Actions */}
        <div className="flex items-center gap-2.5">
          <select
            value={selectedWorkflowId}
            onChange={(e) => setSelectedWorkflowId(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 outline-none focus:border-purple-500 cursor-pointer"
          >
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Node</span>
          </button>

          <button
            onClick={handleRunWorkflow}
            disabled={isRunning}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition shadow-lg ${
              isRunning
                ? "bg-purple-600/50 text-white cursor-wait animate-pulse"
                : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white cursor-pointer shadow-purple-600/20"
            }`}
          >
            {isRunning ? (
              <>
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
                <span>Running Pipeline...</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Run Flow</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="relative flex-1 overflow-auto bg-dot-grid p-8 min-h-[500px]">
        {/* SVG Bezier Wire Connections */}
        <svg className="absolute inset-0 h-full w-full pointer-events-none z-0">
          <defs>
            <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.8" />
            </linearGradient>
            <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const start = getNodeCenter(edge.source);
            const end = getNodeCenter(edge.target);
            const dx = Math.abs(end.x - start.x) * 0.5;
            const pathData = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;

            return (
              <g key={edge.id}>
                <path
                  d={pathData}
                  fill="none"
                  stroke="rgba(139, 92, 246, 0.25)"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <path
                  d={pathData}
                  fill="none"
                  stroke="url(#edgeGrad)"
                  strokeWidth="2.5"
                  strokeDasharray={isRunning ? "6, 4" : undefined}
                  className={isRunning ? "animate-wire-flow" : ""}
                  markerEnd="url(#arrow)"
                />
              </g>
            );
          })}
        </svg>

        {/* Nodes Layer */}
        <div className="relative z-10 w-full h-full min-w-[1300px] min-h-[450px]">
          {nodes.map((node) => {
            const meta = NODE_META[node.type] || NODE_META.ai_script || {
              label: node.name,
              icon: Sparkles,
              color: "border-zinc-500",
              badge: "Task",
            };
            const Icon = meta.icon;
            const isSelected = selectedNode?.id === node.id;

            return (
              <div
                key={node.id}
                onClick={() => setSelectedNode(node)}
                style={{
                  left: `${node.position.x}px`,
                  top: `${node.position.y}px`,
                  position: "absolute",
                }}
                className={`w-[220px] rounded-xl border p-3.5 backdrop-blur-md transition-all cursor-pointer shadow-xl ${
                  isSelected
                    ? "ring-2 ring-purple-500 border-purple-400 bg-zinc-900 shadow-purple-500/20"
                    : "border-zinc-800 bg-zinc-900/90 hover:border-zinc-700 hover:bg-zinc-850"
                } ${
                  node.status === "running"
                    ? "border-cyan-400 ring-2 ring-cyan-400/50 shadow-cyan-500/30 animate-pulse"
                    : node.status === "completed"
                    ? "border-emerald-500/70 shadow-emerald-500/10"
                    : ""
                }`}
              >
                {/* Node Top Header */}
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${meta.color}`}>
                    {meta.badge}
                  </span>
                  {node.status === "completed" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  )}
                  {node.status === "running" && (
                    <RotateCw className="h-4 w-4 text-cyan-400 animate-spin" />
                  )}
                  {node.status === "failed" && (
                    <XCircle className="h-4 w-4 text-red-400" />
                  )}
                </div>

                {/* Node Title & Icon */}
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="p-1.5 rounded-lg bg-zinc-800 text-zinc-200">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-100 truncate">{node.name}</h4>
                </div>

                {/* Node Summary Subtext */}
                <p className="text-[11px] text-zinc-400 line-clamp-2">
                  {node.config.prompt || node.config.cron || node.config.platform || node.config.resolution || "Active step component"}
                </p>

                {/* Node Output Snippet if completed */}
                {node.lastOutput && (
                  <div className="mt-2.5 rounded-md bg-zinc-950/80 p-1.5 border border-zinc-800/80 text-[10px] text-emerald-400 font-mono truncate">
                    ✔ {JSON.stringify(node.lastOutput).slice(0, 35)}...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Execution Console & Inspector */}
      <div className="flex h-44 border-t border-zinc-800 bg-zinc-900/90 divide-x divide-zinc-800">
        {/* Node Inspector Drawer */}
        <div className="w-1/2 p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
              {selectedNode ? `Node Inspector: ${selectedNode.name}` : "Select a node to inspect parameters"}
            </span>
            {selectedNode && (
              <span className="text-[10px] text-zinc-500 font-mono">ID: {selectedNode.id}</span>
            )}
          </div>
          {selectedNode ? (
            <div className="space-y-2 text-xs">
              <div className="rounded-lg bg-zinc-950 p-2.5 border border-zinc-800 font-mono text-zinc-300">
                <div className="text-[10px] text-purple-400 mb-1 font-bold">CONFIG PARAMETERS</div>
                <pre className="text-[11px] overflow-x-auto">{JSON.stringify(selectedNode.config, null, 2)}</pre>
              </div>
              {selectedNode.lastOutput && (
                <div className="rounded-lg bg-zinc-950 p-2.5 border border-zinc-800 font-mono text-emerald-400">
                  <div className="text-[10px] text-emerald-400 mb-1 font-bold">LAST EXECUTION OUTPUT</div>
                  <pre className="text-[11px] overflow-x-auto">{JSON.stringify(selectedNode.lastOutput, null, 2)}</pre>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 italic mt-4">
              Click on any block on the canvas above to customize its prompt, API keys, or input links.
            </p>
          )}
        </div>

        {/* Live Step Logs */}
        <div className="w-1/2 p-3 overflow-y-auto font-mono text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-zinc-300 font-sans uppercase tracking-wider">
              Live Execution Telemetry
            </span>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              Engine Ready
            </span>
          </div>
          <div className="space-y-1">
            {executionLogs.length === 0 ? (
              <p className="text-zinc-500 italic">No runs yet. Click "Run Flow" to test the pipeline.</p>
            ) : (
              executionLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span className="text-zinc-600 shrink-0">[{log.timestamp}]</span>
                  <span
                    className={
                      log.type === "success"
                        ? "text-emerald-400"
                        : log.type === "error"
                        ? "text-rose-400"
                        : "text-zinc-300"
                    }
                  >
                    {log.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
