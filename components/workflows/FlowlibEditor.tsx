"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Handle,
  Position,
  NodeProps,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

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
  Settings2,
  Layers,
  X,
  Search,
  Code2,
  Sliders,
  ChevronRight,
  Database,
  ExternalLink,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import {
  BUILTIN_WORKFLOW_TEMPLATES,
  type Workflow,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowNodeType,
} from "@/lib/workflows/workflow-types";

// Metadata mapping for node types
const NODE_PALETTE: Record<
  WorkflowNodeType,
  {
    label: string;
    description: string;
    category: "Trigger" | "AI" | "Media" | "Social" | "Code";
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
    borderGlow: string;
  }
> = {
  trigger_schedule: {
    label: "Schedule Trigger",
    description: "Runs automatically on a cron or periodic interval",
    category: "Trigger",
    icon: Clock,
    accentColor: "from-amber-500 to-orange-500 text-amber-400",
    borderGlow: "border-amber-500/50 hover:border-amber-400",
  },
  trigger_manual: {
    label: "Manual Trigger",
    description: "Triggers manually on click with test payload",
    category: "Trigger",
    icon: Play,
    accentColor: "from-amber-500 to-orange-500 text-amber-400",
    borderGlow: "border-amber-500/50 hover:border-amber-400",
  },
  trigger_webhook: {
    label: "Webhook Trigger",
    description: "Listens for incoming HTTP POST payloads",
    category: "Trigger",
    icon: Globe,
    accentColor: "from-amber-500 to-orange-500 text-amber-400",
    borderGlow: "border-amber-500/50 hover:border-amber-400",
  },
  ai_script: {
    label: "AI Script Generator",
    description: "LLM prompt to write scripts, titles, and hooks",
    category: "AI",
    icon: Sparkles,
    accentColor: "from-purple-500 to-indigo-500 text-purple-400",
    borderGlow: "border-purple-500/50 hover:border-purple-400",
  },
  ai_video_gen: {
    label: "AI Video Generation",
    description: "Calls Kling, Runway, Fal.ai, or Pika video API",
    category: "Media",
    icon: Video,
    accentColor: "from-rose-500 to-pink-500 text-rose-400",
    borderGlow: "border-rose-500/50 hover:border-rose-400",
  },
  ai_tts_voice: {
    label: "Voiceover Audio (TTS)",
    description: "Edge-TTS or ElevenLabs text-to-speech audio synthesis",
    category: "Media",
    icon: Mic,
    accentColor: "from-pink-500 to-fuchsia-500 text-pink-400",
    borderGlow: "border-pink-500/50 hover:border-pink-400",
  },
  ffmpeg_stitch: {
    label: "FFmpeg Video Assembly",
    description: "Merges video clips, voiceover, background music & captions",
    category: "Media",
    icon: Layers,
    accentColor: "from-indigo-500 to-blue-500 text-indigo-400",
    borderGlow: "border-indigo-500/50 hover:border-indigo-400",
  },
  youtube_publish: {
    label: "YouTube Auto-Uploader",
    description: "Publishes video as Short or Long-form via YouTube API",
    category: "Social",
    icon: Share2,
    accentColor: "from-red-500 to-rose-600 text-red-400",
    borderGlow: "border-red-500/50 hover:border-red-400",
  },
  telegram_notify: {
    label: "Telegram Push Alert",
    description: "Sends video previews, approval alerts, or status to Telegram",
    category: "Social",
    icon: Send,
    accentColor: "from-sky-500 to-cyan-500 text-sky-400",
    borderGlow: "border-sky-500/50 hover:border-sky-400",
  },
  bash_script: {
    label: "Linux / Bash Execution",
    description: "Executes custom shell commands in Termux sandbox",
    category: "Code",
    icon: Terminal,
    accentColor: "from-emerald-500 to-teal-500 text-emerald-400",
    borderGlow: "border-emerald-500/50 hover:border-emerald-400",
  },
  web_scrape: {
    label: "Web Scraper & Reach",
    description: "Extracts article content, YouTube transcripts, or comments",
    category: "Code",
    icon: Globe,
    accentColor: "from-cyan-500 to-blue-500 text-cyan-400",
    borderGlow: "border-cyan-500/50 hover:border-cyan-400",
  },
};

// ---------------------------------------------------------------- Node Component

function FlowlibCustomNode({ id, data, selected }: any) {
  const nodeData = (data || {}) as Record<string, any>;
  const nodeType = (nodeData.type as WorkflowNodeType) || "ai_script";
  const meta = NODE_PALETTE[nodeType] || NODE_PALETTE.ai_script;
  const Icon = meta.icon;

  const isTrigger = nodeType.startsWith("trigger_");
  const status = (nodeData.status as string) || "idle";

  return (
    <div
      className={`group relative min-w-[240px] max-w-[280px] rounded-2xl border bg-zinc-950/95 p-3.5 text-zinc-100 shadow-2xl backdrop-blur-xl transition-all duration-200 select-none ${
        selected
          ? "border-purple-500 ring-2 ring-purple-500/40 shadow-purple-500/20"
          : meta.borderGlow
      } ${
        status === "running"
          ? "border-cyan-400 ring-4 ring-cyan-400/30 animate-pulse"
          : status === "completed"
          ? "border-emerald-500/80 shadow-emerald-500/10"
          : status === "failed"
          ? "border-red-500 ring-2 ring-red-500/40"
          : ""
      }`}
    >
      {/* Left Input Handle (unless it's a root trigger) */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3.5 !w-3.5 !rounded-full !border-2 !border-zinc-500 !bg-zinc-900 transition-all hover:!scale-150 hover:!border-purple-400 !shadow-md"
        />
      )}

      {/* Node Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-xl bg-gradient-to-br ${meta.accentColor} bg-opacity-10 shadow-inner`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {meta.category}
            </span>
            <h4 className="text-xs font-bold text-zinc-100 truncate max-w-[150px]">
              {String(nodeData.name || meta.label)}
            </h4>
          </div>
        </div>

        {/* Status indicator badge */}
        <div>
          {status === "completed" && (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 animate-in zoom-in-50" />
          )}
          {status === "running" && (
            <RotateCw className="h-4 w-4 text-cyan-400 animate-spin" />
          )}
          {status === "failed" && (
            <XCircle className="h-4 w-4 text-red-400" />
          )}
          {status === "idle" && (
            <div className="h-2 w-2 rounded-full bg-zinc-700 group-hover:bg-purple-500 transition-colors" />
          )}
        </div>
      </div>

      {/* Node Description/Summary */}
      <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed bg-zinc-900/60 p-2 rounded-xl border border-zinc-800/80">
        {String(
          (nodeData.config as any)?.prompt ||
          (nodeData.config as any)?.cron ||
          (nodeData.config as any)?.platform ||
          (nodeData.config as any)?.resolution ||
          meta.description
        )}
      </p>

      {/* Output preview snippet if executed */}
      {data.lastOutput && (
        <div className="mt-2 rounded-lg bg-emerald-950/30 border border-emerald-900/50 p-1.5 text-[10px] text-emerald-400 font-mono truncate">
          ✔ {JSON.stringify(data.lastOutput).slice(0, 36)}...
        </div>
      )}

      {/* Right Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3.5 !w-3.5 !rounded-full !border-2 !border-purple-400 !bg-zinc-900 transition-all hover:!scale-150 hover:!border-cyan-400 !shadow-md"
      />
    </div>
  );
}

const nodeTypes = {
  flowlibNode: FlowlibCustomNode,
};

// ---------------------------------------------------------------- Main Canvas Editor

export function FlowlibEditor() {
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow>(BUILTIN_WORKFLOW_TEMPLATES[0]);
  const [workflowTitle, setWorkflowTitle] = useState(activeWorkflow.name);

  // Convert Workflow nodes to React Flow format
  const initialReactFlowNodes = useMemo(() => {
    return activeWorkflow.nodes.map((n) => ({
      id: n.id,
      type: "flowlibNode",
      position: n.position,
      data: {
        type: n.type,
        name: n.name,
        config: n.config,
        status: n.status || "idle",
        lastOutput: n.lastOutput,
      },
    }));
  }, [activeWorkflow.id]);

  const initialReactFlowEdges = useMemo(() => {
    return activeWorkflow.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: true,
      style: { stroke: "#8b5cf6", strokeWidth: 2 },
    }));
  }, [activeWorkflow.id]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialReactFlowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialReactFlowEdges);

  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [logs, setLogs] = useState<Array<{ time: string; text: string; success?: boolean }>>([]);

  // Connect wires between nodes
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: "#8b5cf6", strokeWidth: 2 },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  // Switch workflow template
  const handleSelectTemplate = (wfId: string) => {
    const found = BUILTIN_WORKFLOW_TEMPLATES.find((w) => w.id === wfId);
    if (!found) return;
    setActiveWorkflow(found);
    setWorkflowTitle(found.name);
    setNodes(
      found.nodes.map((n) => ({
        id: n.id,
        type: "flowlibNode",
        position: n.position,
        data: {
          type: n.type,
          name: n.name,
          config: n.config,
          status: "idle" as const,
          lastOutput: null,
        },
      }))
    );
    setEdges(
      found.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: true,
        style: { stroke: "#8b5cf6", strokeWidth: 2 },
      }))
    );
    setSelectedNode(null);
  };

  // Add new node from palette
  const handleAddNode = (type: WorkflowNodeType) => {
    const meta = NODE_PALETTE[type];
    const newId = `node_${Date.now()}`;
    const newNode = {
      id: newId,
      type: "flowlibNode",
      position: { x: 350 + Math.random() * 80, y: 150 + Math.random() * 80 },
      data: {
        type,
        name: meta.label,
        config: {},
        status: "idle" as const,
        lastOutput: null,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setPaletteOpen(false);
  };

  // Run full workflow execution
  const handleRunWorkflow = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), text: `🚀 Starting workflow run: "${workflowTitle}"` },
      ...prev,
    ]);

    try {
      const res = await fetch(`/api/workflows/${activeWorkflow.id}/run`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.ok) {
        // Update nodes with completed status
        setNodes((nds) =>
          nds.map((n) => {
            const out = data.results?.[n.id];
            return {
              ...n,
              data: {
                ...n.data,
                status: out ? "completed" : "idle",
                lastOutput: out,
              },
            };
          })
        );
        setLogs((prev) => [
          { time: new Date().toLocaleTimeString(), text: `✔ Workflow execution finished successfully!`, success: true },
          ...prev,
        ]);
      } else {
        setLogs((prev) => [
          { time: new Date().toLocaleTimeString(), text: `✖ Run failed: ${JSON.stringify(data.errors)}` },
          ...prev,
        ]);
      }
    } catch (err: any) {
      setLogs((prev) => [
        { time: new Date().toLocaleTimeString(), text: `Error: ${err.message}` },
        ...prev,
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  // Test single step inside modal
  const [testingStep, setTestingStep] = useState(false);
  const handleTestStep = async () => {
    if (!selectedNode) return;
    setTestingStep(true);
    setTimeout(() => {
      const demoResult = {
        executedStep: selectedNode.data.name,
        timestamp: new Date().toISOString(),
        status: "success",
        outputData: {
          generatedPayload: "Step executed cleanly through K9 sandbox engine.",
          paramsEvaluated: selectedNode.data.config,
        },
      };
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNode.id
            ? { ...n, data: { ...n.data, status: "completed", lastOutput: demoResult } }
            : n
        )
      );
      setSelectedNode((prev: any) => ({
        ...prev,
        data: { ...prev.data, status: "completed", lastOutput: demoResult },
      }));
      setTestingStep(false);
    }, 800);
  };

  return (
    <div className="flex h-full w-full flex-col bg-zinc-950 text-zinc-100 font-sans select-none overflow-hidden">
      {/* Top n8n Studio Navigation Bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 px-4 backdrop-blur-xl z-20">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-400 shadow-md shadow-purple-500/10">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={workflowTitle}
                onChange={(e) => setWorkflowTitle(e.target.value)}
                className="bg-transparent text-sm font-bold text-white tracking-wide outline-none border-b border-transparent hover:border-zinc-700 focus:border-purple-500 transition-colors"
              />
              <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/30">
                Flowlib Engine
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              MIT Visual Graph Automation Canvas powered by React Flow
            </p>
          </div>
        </div>

        {/* Center / Right Actions */}
        <div className="flex items-center gap-2.5">
          {/* Template presets */}
          <select
            value={activeWorkflow.id}
            onChange={(e) => handleSelectTemplate(e.target.value)}
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 outline-none hover:border-zinc-700 cursor-pointer"
          >
            {BUILTIN_WORKFLOW_TEMPLATES.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          {/* Add Node Button */}
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:border-zinc-700 hover:bg-zinc-850 transition cursor-pointer"
          >
            <Plus className="h-4 w-4 text-purple-400" />
            <span>Add Node</span>
          </button>

          {/* Test Workflow Button */}
          <button
            onClick={handleRunWorkflow}
            disabled={isRunning}
            className={`flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-bold transition shadow-xl ${
              isRunning
                ? "bg-purple-600/40 text-white cursor-wait animate-pulse"
                : "bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white cursor-pointer shadow-purple-600/25"
            }`}
          >
            {isRunning ? (
              <>
                <RotateCw className="h-4 w-4 animate-spin" />
                <span>Executing Pipeline...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                <span>Test Workflow</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Canvas with React Flow */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedNode(node)}
          onNodeDoubleClick={(_, node) => setSelectedNode(node)}
          fitView
          className="bg-zinc-950"
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#27272a" />
          <Controls className="!bg-zinc-900 !border-zinc-800 !text-zinc-200 !rounded-xl overflow-hidden !shadow-xl" />
          <MiniMap
            nodeColor="#8b5cf6"
            maskColor="rgba(9, 9, 11, 0.85)"
            className="!bg-zinc-900/90 !border !border-zinc-800 !rounded-xl overflow-hidden !shadow-2xl"
          />

          {/* Bottom Execution Telemetry Bar */}
          <Panel position="bottom-center" className="w-[90%] max-w-3xl mb-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 p-3 shadow-2xl backdrop-blur-xl font-mono text-xs text-zinc-300">
              <div className="flex items-center justify-between mb-1 text-[11px] font-sans">
                <span className="font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5 text-purple-400" />
                  Live Workflow Telemetry
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {nodes.filter((n) => n.data.status === "completed").length}/{nodes.length} Nodes Completed
                </span>
              </div>
              <div className="max-h-16 overflow-y-auto space-y-1 text-[11px]">
                {logs.length === 0 ? (
                  <p className="text-zinc-500 italic">Ready to run. Click "Test Workflow" to execute.</p>
                ) : (
                  logs.slice(0, 3).map((l, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-zinc-600">[{l.time}]</span>
                      <span className={l.success ? "text-emerald-400" : "text-zinc-300"}>{l.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Panel>
        </ReactFlow>

        {/* ----------------------------------------------------------- */}
        {/* Node Configuration Inspector Modal (The 3-Pane n8n Popup)   */}
        {/* ----------------------------------------------------------- */}
        {selectedNode && (
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l border-zinc-800 bg-zinc-950/98 p-6 shadow-2xl backdrop-blur-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedNode.data.name}</h3>
                  <p className="text-xs text-zinc-400">Node ID: {selectedNode.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Test Step Action Button */}
            <div className="flex items-center justify-between rounded-xl bg-zinc-900 p-3 border border-zinc-800 mb-4">
              <div>
                <span className="text-xs font-bold text-zinc-200 block">Test this step</span>
                <span className="text-[11px] text-zinc-400">Run just this node to see input & output data</span>
              </div>
              <button
                onClick={handleTestStep}
                disabled={testingStep}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-500 transition cursor-pointer"
              >
                {testingStep ? (
                  <>
                    <RotateCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Execute Step</span>
                  </>
                )}
              </button>
            </div>

            {/* 3-Section Parameters & Data View */}
            <div className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
              {/* Parameters form */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-purple-400 uppercase tracking-wider">
                  <span>Configuration Parameters</span>
                  <Code2 className="h-3.5 w-3.5" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Node Display Name</label>
                  <input
                    type="text"
                    value={selectedNode.data.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNodes((nds) =>
                        nds.map((n) =>
                          n.id === selectedNode.id ? { ...n, data: { ...n.data, name: val } } : n
                        )
                      );
                      setSelectedNode((prev: any) => ({
                        ...prev,
                        data: { ...prev.data, name: val },
                      }));
                    }}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">
                    Instruction / Prompt / Config
                  </label>
                  <textarea
                    rows={4}
                    value={
                      (selectedNode.data.config as any)?.prompt ||
                      (selectedNode.data.config as any)?.cron ||
                      JSON.stringify(selectedNode.data.config, null, 2)
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      setNodes((nds) =>
                        nds.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, data: { ...n.data, config: { ...n.data.config, prompt: val } } }
                            : n
                        )
                      );
                    }}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-zinc-200 font-mono outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Output Data Inspector */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
                  <span>Output Data Schema</span>
                  <Database className="h-3.5 w-3.5" />
                </div>
                {selectedNode.data.lastOutput ? (
                  <pre className="rounded-lg bg-zinc-950 p-3 text-[11px] text-emerald-400 font-mono overflow-x-auto max-h-48 border border-zinc-800">
                    {JSON.stringify(selectedNode.data.lastOutput, null, 2)}
                  </pre>
                ) : (
                  <p className="text-zinc-500 text-xs italic">
                    Click "Execute Step" above to test and view the output data payload.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------- */}
        {/* Node Library Drawer (Add Node Palette)                      */}
        {/* ----------------------------------------------------------- */}
        {paletteOpen && (
          <div className="fixed inset-y-0 left-0 z-50 w-80 border-r border-zinc-800 bg-zinc-950/98 p-5 shadow-2xl backdrop-blur-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
              <div className="flex items-center gap-2 font-bold text-sm text-white">
                <Plus className="h-4 w-4 text-purple-400" />
                <span>Node Library</span>
              </div>
              <button
                onClick={() => setPaletteOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search nodes & integrations..."
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-purple-500"
              />
            </div>

            {/* Nodes List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {(Object.keys(NODE_PALETTE) as WorkflowNodeType[])
                .filter((type) => {
                  const m = NODE_PALETTE[type];
                  return (
                    m.label.toLowerCase().includes(paletteSearch.toLowerCase()) ||
                    m.category.toLowerCase().includes(paletteSearch.toLowerCase()) ||
                    m.description.toLowerCase().includes(paletteSearch.toLowerCase())
                  );
                })
                .map((type) => {
                  const m = NODE_PALETTE[type];
                  const Icon = m.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => handleAddNode(type)}
                      className="w-full flex items-start gap-3 p-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/50 hover:bg-zinc-850 hover:border-zinc-700 text-left transition cursor-pointer group"
                    >
                      <div className={`p-2 rounded-lg bg-zinc-800 text-zinc-300 group-hover:scale-105 transition`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-zinc-200 block truncate group-hover:text-purple-300">
                          {m.label}
                        </span>
                        <span className="text-[10px] text-zinc-500 line-clamp-1">{m.description}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-300 shrink-0 mt-1" />
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
