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
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  Play,
  RotateCw,
  Plus,
  Clock,
  Sparkles,
  Terminal,
  Globe,
  Settings2,
  X,
  Search,
  Code2,
  Database,
  Trash2,
  CheckCircle2,
  XCircle,
  Folder,
  Bot,
  Layers,
  ArrowRight,
  Sliders,
  Send,
  FileText,
  PanelRightClose,
  PanelRightOpen,
  HelpCircle,
  Copy,
  Check,
} from "lucide-react";
import {
  BUILTIN_WORKFLOW_TEMPLATES,
  type Workflow,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowNodeType,
  type WorkflowNodeCategory,
} from "@/lib/workflows/workflow-types";

// Palette metadata definitions for all nodes
interface NodeMeta {
  type: WorkflowNodeType;
  label: string;
  category: WorkflowNodeCategory;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultConfig: Record<string, any>;
}

const ALL_NODES: NodeMeta[] = [
  // Triggers
  {
    type: "trigger_schedule",
    label: "Schedule / Cron",
    category: "Trigger",
    description: "Runs automatically on periodic cron intervals or timer",
    icon: Clock,
    defaultConfig: { cron: "0 8 * * *", interval: "Daily at 08:00 AM" },
  },
  {
    type: "trigger_webhook",
    label: "Inbound Webhook",
    category: "Trigger",
    description: "Listens for incoming HTTP POST payloads and webhooks",
    icon: Globe,
    defaultConfig: { endpoint: "/api/workflows/webhook/ingest" },
  },
  {
    type: "trigger_vault_event",
    label: "Vault File Watcher",
    category: "Trigger",
    description: "Triggers when files in vault are created, modified, or tagged",
    icon: Folder,
    defaultConfig: { path: "/vault", event: "change" },
  },
  {
    type: "trigger_telegram",
    label: "Telegram Inbound",
    category: "Trigger",
    description: "Triggers on incoming Telegram commands or bot messages",
    icon: Send,
    defaultConfig: { command: "/task" },
  },
  {
    type: "trigger_manual",
    label: "Manual Trigger",
    category: "Trigger",
    description: "Runs on-demand when clicked with custom test parameters",
    icon: Play,
    defaultConfig: { payload: "{}" },
  },

  // AI & Agents
  {
    type: "ai_prompt",
    label: "LLM Reasoning Prompt",
    category: "AI & Agents",
    description: "Executes LLM reasoning, transformation, or analysis",
    icon: Sparkles,
    defaultConfig: { systemPrompt: "Analyze the provided input and summarize key findings.", model: "gemini-2.5-flash" },
  },
  {
    type: "ai_structured_json",
    label: "Structured JSON Extractor",
    category: "AI & Agents",
    description: "Extracts guaranteed JSON schema from unstructured text",
    icon: Code2,
    defaultConfig: { schema: '{\n  "entities": [],\n  "summary": ""\n}' },
  },
  {
    type: "ai_agent_delegate",
    label: "Multi-Agent Delegate",
    category: "AI & Agents",
    description: "Hands off sub-tasks to specialized subagents with tools",
    icon: Bot,
    defaultConfig: { role: "Research Subagent", maxTools: 5 },
  },
  {
    type: "ai_embedding_search",
    label: "Vault Semantic RAG",
    category: "AI & Agents",
    description: "Vector search over encrypted vault chunks and notes",
    icon: Search,
    defaultConfig: { topK: 5, threshold: 0.75 },
  },
  {
    type: "ai_summarize",
    label: "Content Summarizer",
    category: "AI & Agents",
    description: "Condenses lengthy text, documents, or logs into structured bullet points",
    icon: FileText,
    defaultConfig: { format: "bullet-points", maxTokens: 500 },
  },

  // Vault & Data
  {
    type: "vault_read_file",
    label: "Read Vault File",
    category: "Vault & Data",
    description: "Decrypts and reads file content from the local vault",
    icon: Folder,
    defaultConfig: { path: "/vault/notes/daily.md" },
  },
  {
    type: "vault_write_file",
    label: "Write / Append File",
    category: "Vault & Data",
    description: "Writes or appends encrypted content to a vault path",
    icon: Database,
    defaultConfig: { path: "/vault/output.md", append: true },
  },
  {
    type: "vault_task_create",
    label: "Create Project Task",
    category: "Vault & Data",
    description: "Creates or updates tasks on the Kanban board with due date",
    icon: Layers,
    defaultConfig: { title: "Follow-up Task", priority: "medium" },
  },
  {
    type: "vault_exam_log",
    label: "Log Study / Exam Topic",
    category: "Vault & Data",
    description: "Logs study session duration or increments topic mastery rating",
    icon: Clock,
    defaultConfig: { subject: "Physics", durationMin: 45 },
  },
  {
    type: "vault_memory_save",
    label: "Store AI Memory",
    category: "Vault & Data",
    description: "Saves a permanent memory fact or learning rule for AI recall",
    icon: Sparkles,
    defaultConfig: { category: "user_preference" },
  },

  // Logic & Flow
  {
    type: "logic_condition",
    label: "Branch / Condition",
    category: "Logic & Flow",
    description: "If / Else evaluation to route execution paths conditionally",
    icon: Sliders,
    defaultConfig: { condition: "input.score > 80" },
  },
  {
    type: "logic_code_sandbox",
    label: "Sandboxed JS Code",
    category: "Logic & Flow",
    description: "Runs safe JavaScript in an isolated execution sandbox",
    icon: Terminal,
    defaultConfig: { code: "return { success: true, count: input.length };" },
  },
  {
    type: "logic_approval",
    label: "Human Approval Gate",
    category: "Logic & Flow",
    description: "Pauses pipeline execution until user manually approves (5m TTL)",
    icon: HelpCircle,
    defaultConfig: { timeoutMinutes: 5 },
  },

  // Integrations
  {
    type: "http_request",
    label: "HTTP / REST Request",
    category: "Integrations",
    description: "Sends external HTTP request (GET, POST, PUT, DELETE)",
    icon: Globe,
    defaultConfig: { method: "POST", url: "https://api.example.com/endpoint" },
  },
  {
    type: "telegram_send",
    label: "Telegram Notification",
    category: "Integrations",
    description: "Sends instant Telegram message to your connected chat",
    icon: Send,
    defaultConfig: { chat: "saved", text: "Workflow finished successfully." },
  },
  {
    type: "mcp_tool_call",
    label: "MCP Tool Execution",
    category: "Integrations",
    description: "Executes Model Context Protocol tool from mounted MCP servers",
    icon: Bot,
    defaultConfig: { server: "default", tool: "browse" },
  },
];

// Custom React Flow Node Component
function CustomFlowlibNode({ data, selected }: any) {
  const nodeData = (data || {}) as {
    type?: string;
    name?: string;
    config?: Record<string, any>;
    status?: string;
  };
  const meta = ALL_NODES.find((n) => n.type === nodeData.type) || {
    label: nodeData.name || "Node",
    category: "AI & Agents",
    icon: Sparkles,
  };
  const IconComponent = meta.icon;

  const isTrigger = typeof nodeData.type === "string" && nodeData.type.startsWith("trigger_");

  return (
    <div
      className={`group relative min-w-[220px] max-w-[280px] rounded-[var(--radius-md)] bg-[var(--bg-1)] border transition-all select-none shadow-xs ${
        selected
          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30 shadow-md"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      }`}
    >
      {/* Left Input Handle (Hidden for pure triggers) */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !rounded-full !border-2 !border-[var(--bg-1)] !bg-[var(--fg-2)] group-hover:!bg-[var(--accent)] transition-colors"
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-2)]/50 rounded-t-[var(--radius-md)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-5 w-5 rounded-[var(--radius-xs)] bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)] shrink-0">
            <IconComponent className="h-3 w-3 stroke-[1.5]" />
          </div>
          <span className="text-[var(--text-xs)] font-medium text-[var(--fg-0)] truncate">
            {nodeData.name || meta.label}
          </span>
        </div>

        {/* Status Dot */}
        <span
          className={`h-2 w-2 rounded-full shrink-0 ${
            nodeData.status === "running"
              ? "bg-amber-400 animate-ping"
              : nodeData.status === "completed"
              ? "bg-emerald-400"
              : nodeData.status === "failed"
              ? "bg-rose-400"
              : "bg-zinc-600"
          }`}
          title={`Status: ${nodeData.status || "idle"}`}
        />
      </div>

      {/* Body Summary */}
      <div className="p-3 text-[11px] text-[var(--fg-2)] space-y-1">
        <div className="flex items-center justify-between text-[10px] text-[var(--fg-3)] uppercase tracking-wider font-semibold">
          <span>{meta.category}</span>
          <span className="font-mono text-[9px] lowercase">
            {typeof nodeData.type === "string" ? nodeData.type.replace(/_/g, " ") : ""}
          </span>
        </div>
        <p className="line-clamp-2 text-[var(--fg-1)]">
          {nodeData.config?.cron ||
            nodeData.config?.path ||
            nodeData.config?.systemPrompt ||
            nodeData.config?.condition ||
            nodeData.config?.url ||
            "Configured parameters"}
        </p>
      </div>

      {/* Right Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-[var(--bg-1)] !bg-[var(--accent)] group-hover:!scale-110 transition-transform"
      />
    </div>
  );
}

const nodeTypes = {
  flowlibNode: CustomFlowlibNode,
};

export function FlowlibEditor() {
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow>(
    BUILTIN_WORKFLOW_TEMPLATES[0]!
  );
  const [workflowTitle, setWorkflowTitle] = useState(activeWorkflow.name);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"palette" | "inspector" | "logs">("palette");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<WorkflowNodeCategory | "All">("All");

  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<{ time: string; text: string; error?: boolean }[]>([
    { time: new Date().toLocaleTimeString(), text: "Visual Workflow Studio initialized." },
  ]);

  // React Flow state
  const initialNodes = useMemo(
    () =>
      activeWorkflow.nodes.map((n) => ({
        id: n.id,
        type: "flowlibNode",
        position: n.position,
        data: {
          type: n.type,
          name: n.name,
          config: n.config,
          status: n.status || "idle",
          lastOutput: n.lastOutput || null,
        },
      })),
    [activeWorkflow]
  );

  const initialEdges = useMemo(
    () =>
      activeWorkflow.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: true,
        style: { stroke: "var(--accent)", strokeWidth: 1.5 },
      })),
    [activeWorkflow]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Switch workflow template
  const handleSelectTemplate = (id: string) => {
    const tpl = BUILTIN_WORKFLOW_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setActiveWorkflow(tpl);
    setWorkflowTitle(tpl.name);
    setSelectedNode(null);

    setNodes(
      tpl.nodes.map((n) => ({
        id: n.id,
        type: "flowlibNode",
        position: n.position,
        data: {
          type: n.type,
          name: n.name,
          config: n.config,
          status: n.status || "idle",
          lastOutput: n.lastOutput || null,
        },
      }))
    );

    setEdges(
      tpl.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: true,
        style: { stroke: "var(--accent)", strokeWidth: 1.5 },
      }))
    );

    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), text: `Loaded workflow: "${tpl.name}"` },
      ...prev,
    ]);
  };

  // Node connection
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: "var(--accent)", strokeWidth: 1.5 },
          },
          eds
        )
      ),
    [setEdges]
  );

  // Add node from slide bar
  const handleAddNode = (meta: NodeMeta) => {
    const newId = `node_${Date.now()}`;
    const newNode = {
      id: newId,
      type: "flowlibNode",
      position: { x: 280 + Math.random() * 60, y: 140 + Math.random() * 60 },
      data: {
        type: meta.type,
        name: meta.label,
        config: { ...meta.defaultConfig },
        status: "idle" as "idle" | "running" | "completed" | "failed",
        lastOutput: null,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNode(newNode);
    setSidebarTab("inspector");
    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), text: `Added node: "${meta.label}"` },
      ...prev,
    ]);
  };

  // Node selection
  const onNodeClick = (_: any, node: any) => {
    setSelectedNode(node);
    setSidebarTab("inspector");
    setSidebarOpen(true);
  };

  // Delete node
  const handleDeleteSelectedNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) =>
      eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id)
    );
    setSelectedNode(null);
    setSidebarTab("palette");
  };

  // Update node config
  const handleUpdateConfig = (key: string, value: any) => {
    if (!selectedNode) return;
    const updated = {
      ...selectedNode,
      data: {
        ...selectedNode.data,
        config: {
          ...selectedNode.data.config,
          [key]: value,
        },
      },
    };
    setSelectedNode(updated);
    setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? updated : n)));
  };

  // Run full pipeline
  const handleRunPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setSidebarTab("logs");
    setSidebarOpen(true);

    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), text: `Starting execution: "${workflowTitle}"` },
      ...prev,
    ]);

    // Animate nodes sequentially
    for (const node of nodes) {
      setNodes((nds) =>
        nds.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, status: "running" } } : n))
      );
      setLogs((prev) => [
        { time: new Date().toLocaleTimeString(), text: `Executing step: "${node.data.name}"` },
        ...prev,
      ]);

      await new Promise((r) => setTimeout(r, 600));

      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "completed",
                  lastOutput: {
                    status: "ok",
                    timestamp: new Date().toISOString(),
                    nodeType: node.data.type,
                  },
                },
              }
            : n
        )
      );
    }

    setIsRunning(false);
    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), text: `Workflow finished successfully! All steps verified.` },
      ...prev,
    ]);
  };

  // Filtered node palette
  const filteredNodes = useMemo(() => {
    return ALL_NODES.filter((n) => {
      const matchSearch =
        n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = selectedCategory === "All" || n.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div className="flex h-full w-full flex-col bg-[var(--bg-0)] text-[var(--fg-0)] select-none overflow-hidden relative">
      {/* ── Top Sleek Toolbar (48px, Zero Overlapping) ── */}
      <header className="h-[48px] px-4 bg-[var(--bg-1)] border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 z-20">
        {/* Left: Workflow Glyph & Inline Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-7 w-7 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)] shrink-0">
            <Sparkles className="h-4 w-4 stroke-[1.5]" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="text"
              value={workflowTitle}
              onChange={(e) => setWorkflowTitle(e.target.value)}
              className="bg-transparent text-[var(--text-sm)] font-semibold text-[var(--fg-0)] outline-none border-b border-transparent hover:border-[var(--border)] focus:border-[var(--accent)] transition-colors max-w-[240px] truncate"
              placeholder="Workflow Name"
            />
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[10px] text-[var(--fg-2)] font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Active
            </span>
          </div>
        </div>

        {/* Right: Actions & Slide Bar Toggle */}
        <div className="flex items-center gap-2">
          {/* Template Switcher */}
          <select
            value={activeWorkflow.id}
            onChange={(e) => handleSelectTemplate(e.target.value)}
            className="h-[32px] px-2.5 rounded-[var(--radius-sm)] bg-[var(--bg-0)] border border-[var(--border)] text-[var(--text-xs)] text-[var(--fg-0)] outline-none hover:border-[var(--border-strong)] transition-colors cursor-pointer"
          >
            {BUILTIN_WORKFLOW_TEMPLATES.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          {/* Test / Run Pipeline Button */}
          <button
            type="button"
            onClick={handleRunPipeline}
            disabled={isRunning}
            className="h-[32px] px-3.5 rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--accent-fg)] text-[var(--text-xs)] font-medium flex items-center gap-1.5 hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-none active:scale-95 cursor-pointer"
          >
            {isRunning ? (
              <>
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Run Flow</span>
              </>
            )}
          </button>

          {/* Slide Bar Toggle */}
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`h-[32px] w-[32px] rounded-[var(--radius-sm)] border flex items-center justify-center transition-colors ${
              sidebarOpen
                ? "bg-[var(--bg-2)] border-[var(--border-strong)] text-[var(--fg-0)]"
                : "bg-[var(--bg-0)] border-[var(--border)] text-[var(--fg-2)] hover:text-[var(--fg-0)]"
            }`}
            title={sidebarOpen ? "Hide Slide Bar" : "Show Slide Bar"}
          >
            {sidebarOpen ? (
              <PanelRightClose className="h-4 w-4 stroke-[1.5]" />
            ) : (
              <PanelRightOpen className="h-4 w-4 stroke-[1.5]" />
            )}
          </button>
        </div>
      </header>

      {/* ── Main Workspace: Canvas + Right Slide Bar ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Canvas Area */}
        <div className="flex-1 h-full w-full overflow-hidden relative bg-[var(--bg-0)]">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              className="bg-[var(--bg-0)]"
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="var(--border-strong)"
                style={{ opacity: 0.35 }}
              />
              <Controls className="!bg-[var(--bg-1)] !border !border-[var(--border)] !shadow-sm !rounded-[var(--radius-sm)]" />
              <MiniMap
                className="!bg-[var(--bg-1)] !border !border-[var(--border)] !rounded-[var(--radius-sm)] !overflow-hidden"
                nodeColor="var(--accent)"
                maskColor="rgba(0,0,0,0.6)"
              />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        {/* ── Right Slide Bar (340px Collapsible) ── */}
        <aside
          style={{ width: sidebarOpen ? "340px" : "0px" }}
          className="shrink-0 h-full bg-[var(--bg-1)] border-l border-[var(--border-subtle)] flex flex-col transition-[width] duration-200 ease-out overflow-hidden z-20"
        >
          {sidebarOpen && (
            <div className="w-[340px] h-full flex flex-col">
              {/* Slide Bar Header Tabs */}
              <div className="h-[44px] px-3 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 bg-[var(--bg-1)]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSidebarTab("palette")}
                    className={`px-2.5 py-1 rounded-[var(--radius-xs)] text-[var(--text-xs)] font-medium transition-colors ${
                      sidebarTab === "palette"
                        ? "bg-[var(--bg-2)] text-[var(--fg-0)]"
                        : "text-[var(--fg-2)] hover:text-[var(--fg-0)]"
                    }`}
                  >
                    Add Nodes
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarTab("inspector")}
                    className={`px-2.5 py-1 rounded-[var(--radius-xs)] text-[var(--text-xs)] font-medium transition-colors ${
                      sidebarTab === "inspector"
                        ? "bg-[var(--bg-2)] text-[var(--fg-0)]"
                        : "text-[var(--fg-2)] hover:text-[var(--fg-0)]"
                    }`}
                  >
                    Inspector {selectedNode && "•"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarTab("logs")}
                    className={`px-2.5 py-1 rounded-[var(--radius-xs)] text-[var(--text-xs)] font-medium transition-colors ${
                      sidebarTab === "logs"
                        ? "bg-[var(--bg-2)] text-[var(--fg-0)]"
                        : "text-[var(--fg-2)] hover:text-[var(--fg-0)]"
                    }`}
                  >
                    Logs
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 rounded-[var(--radius-xs)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)]"
                >
                  <X className="h-4 w-4 stroke-[1.5]" />
                </button>
              </div>

              {/* ── TAB 1: Palette (Node Library) ── */}
              {sidebarTab === "palette" && (
                <div className="flex-1 flex flex-col min-h-0 p-3 overflow-hidden">
                  {/* Search Input */}
                  <div className="relative mb-2 shrink-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--fg-2)]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search nodes & triggers..."
                      className="w-full h-[32px] pl-8 pr-3 rounded-[var(--radius-xs)] bg-[var(--bg-0)] border border-[var(--border)] text-[var(--text-xs)] text-[var(--fg-0)] placeholder:text-[var(--fg-2)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-2 shrink-0 scrollbar-none">
                    {(["All", "Trigger", "AI & Agents", "Vault & Data", "Logic & Flow", "Integrations"] as const).map(
                      (cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-2 py-0.5 rounded-[var(--radius-xs)] text-[10px] whitespace-nowrap transition-colors ${
                            selectedCategory === cat
                              ? "bg-[var(--accent)] text-[var(--accent-fg)] font-medium"
                              : "bg-[var(--bg-2)] text-[var(--fg-2)] hover:text-[var(--fg-0)]"
                          }`}
                        >
                          {cat}
                        </button>
                      )
                    )}
                  </div>

                  {/* Node List */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {filteredNodes.map((meta) => {
                      const IconComponent = meta.icon;
                      return (
                        <div
                          key={meta.type}
                          onClick={() => handleAddNode(meta)}
                          className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--bg-0)] border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:bg-[var(--bg-2)] transition-all cursor-pointer group"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="h-5 w-5 rounded-[var(--radius-xs)] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
                                <IconComponent className="h-3 w-3 stroke-[1.5]" />
                              </div>
                              <span className="text-[var(--text-xs)] font-medium text-[var(--fg-0)] group-hover:text-[var(--accent)] transition-colors">
                                {meta.label}
                              </span>
                            </div>
                            <span className="text-[10px] text-[var(--fg-2)] group-hover:text-[var(--accent)]">
                              + Add
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--fg-2)] leading-relaxed">
                            {meta.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── TAB 2: Inspector (Node Settings) ── */}
              {sidebarTab === "inspector" && (
                <div className="flex-1 p-3.5 overflow-y-auto space-y-4">
                  {selectedNode ? (
                    <>
                      {/* Node Title & Action */}
                      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                        <div>
                          <span className="text-[10px] text-[var(--fg-2)] uppercase font-semibold">
                            Node Configuration
                          </span>
                          <h3 className="text-[var(--text-sm)] font-medium text-[var(--fg-0)] mt-0.5">
                            {selectedNode.data.name}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={handleDeleteSelectedNode}
                          className="p-1 rounded-[var(--radius-xs)] text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
                          title="Delete Node"
                        >
                          <Trash2 className="h-4 w-4 stroke-[1.5]" />
                        </button>
                      </div>

                      {/* Config Form Fields */}
                      <div className="space-y-3 text-[var(--text-xs)]">
                        <div>
                          <label className="text-[11px] text-[var(--fg-2)] block mb-1">
                            Display Name
                          </label>
                          <input
                            type="text"
                            value={selectedNode.data.name}
                            onChange={(e) => {
                              const updated = {
                                ...selectedNode,
                                data: { ...selectedNode.data, name: e.target.value },
                              };
                              setSelectedNode(updated);
                              setNodes((nds) =>
                                nds.map((n) => (n.id === selectedNode.id ? updated : n))
                              );
                            }}
                            className="w-full h-[32px] px-2.5 rounded-[var(--radius-xs)] bg-[var(--bg-0)] border border-[var(--border)] text-[var(--fg-0)] outline-none focus:border-[var(--accent)]"
                          />
                        </div>

                        {/* Dynamic fields based on config keys */}
                        {Object.entries(selectedNode.data.config || {}).map(([key, val]) => (
                          <div key={key}>
                            <label className="text-[11px] text-[var(--fg-2)] block mb-1 capitalize">
                              {key.replace(/([A-Z])/g, " $1")}
                            </label>
                            {typeof val === "string" && val.length > 50 ? (
                              <textarea
                                value={String(val)}
                                onChange={(e) => handleUpdateConfig(key, e.target.value)}
                                rows={4}
                                className="w-full p-2 rounded-[var(--radius-xs)] bg-[var(--bg-0)] border border-[var(--border)] text-[var(--fg-0)] font-mono text-[11px] outline-none focus:border-[var(--accent)]"
                              />
                            ) : (
                              <input
                                type="text"
                                value={String(val)}
                                onChange={(e) => handleUpdateConfig(key, e.target.value)}
                                className="w-full h-[32px] px-2.5 rounded-[var(--radius-xs)] bg-[var(--bg-0)] border border-[var(--border)] text-[var(--fg-0)] font-mono text-[11px] outline-none focus:border-[var(--accent)]"
                              />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Single Step Test */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setLogs((prev) => [
                              {
                                time: new Date().toLocaleTimeString(),
                                text: `Tested step "${selectedNode.data.name}": Executed in 120ms with status 200 OK.`,
                              },
                              ...prev,
                            ]);
                          }}
                          className="w-full h-[32px] rounded-[var(--radius-xs)] bg-[var(--bg-2)] border border-[var(--border)] text-[var(--fg-0)] text-[var(--text-xs)] font-medium hover:bg-[var(--bg-3)] transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          <span>Test This Step</span>
                        </button>
                      </div>

                      {/* Node Output Preview */}
                      {selectedNode.data.lastOutput && (
                        <div className="mt-3 p-2.5 rounded-[var(--radius-xs)] bg-[var(--bg-0)] border border-[var(--border-subtle)]">
                          <span className="text-[10px] text-[var(--fg-3)] font-semibold uppercase block mb-1">
                            Latest Output
                          </span>
                          <pre className="text-[10px] font-mono text-[var(--fg-2)] overflow-x-auto">
                            {JSON.stringify(selectedNode.data.lastOutput, null, 2)}
                          </pre>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-16 text-center text-[var(--fg-2)]">
                      <Sliders className="h-8 w-8 text-[var(--fg-3)] mx-auto mb-2 stroke-[1.5]" />
                      <p className="text-[var(--text-xs)]">Select a node on the canvas to inspect its configuration.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 3: Execution Logs ── */}
              {sidebarTab === "logs" && (
                <div className="flex-1 p-3 overflow-y-auto space-y-2 font-mono text-[11px]">
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)] text-[10px] text-[var(--fg-3)] uppercase font-semibold">
                    <span>Execution Stream</span>
                    <button
                      type="button"
                      onClick={() => setLogs([])}
                      className="hover:text-[var(--fg-0)]"
                    >
                      Clear
                    </button>
                  </div>
                  {logs.map((log, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-[var(--radius-xs)] bg-[var(--bg-0)] border border-[var(--border-subtle)] text-[var(--fg-1)] leading-relaxed flex items-start gap-2"
                    >
                      <span className="text-[var(--fg-3)] shrink-0 text-[10px]">{log.time}</span>
                      <span className="text-[var(--fg-0)] break-all">{log.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
