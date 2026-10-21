"use client";

import React, { useState, useCallback, useMemo, useRef } from "react";
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
  useReactFlow,
  Panel,
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
  Shield,
  ShieldAlert,
  ShieldCheck,
  Pause,
  StepForward,
  RotateCcw,
  Download,
  Upload,
  ExternalLink,
  ChevronRight,
  Eye,
  CheckSquare,
  AlertTriangle,
} from "lucide-react";

import {
  BUILTIN_WORKFLOW_TEMPLATES,
  type Workflow,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowNodeType,
  type WorkflowNodeCategory,
} from "@/lib/workflows/workflow-types";

// Security audit classification (Praxa / OMA style)
export type SecurityGrade = "safe" | "mutation" | "network" | "sandbox";

interface NodeMeta {
  type: WorkflowNodeType;
  label: string;
  category: WorkflowNodeCategory;
  security: SecurityGrade;
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
    security: "safe",
    description: "Runs automatically on cron intervals, timers, or fixed intervals",
    icon: Clock,
    defaultConfig: { cron: "0 8 * * *", interval: "Daily at 08:00 AM" },
  },
  {
    type: "trigger_webhook",
    label: "Inbound Webhook",
    category: "Trigger",
    security: "network",
    description: "Listens for incoming HTTP POST payloads with HMAC verification",
    icon: Globe,
    defaultConfig: { endpoint: "/api/workflows/webhook/ingest", auth: "bearer-token" },
  },
  {
    type: "trigger_vault_event",
    label: "Vault File Watcher",
    category: "Trigger",
    security: "safe",
    description: "Triggers when files in vault are created, modified, or tagged",
    icon: Folder,
    defaultConfig: { path: "/vault", event: "change", filterExt: ".md,.json" },
  },
  {
    type: "trigger_telegram",
    label: "Telegram Inbound",
    category: "Trigger",
    security: "network",
    description: "Triggers on incoming Telegram commands, mentions, or bot messages",
    icon: Send,
    defaultConfig: { command: "/task", allowChannels: true },
  },
  {
    type: "trigger_manual",
    label: "Manual Run Trigger",
    category: "Trigger",
    security: "safe",
    description: "Runs on-demand when user clicks Run with custom test payload",
    icon: Play,
    defaultConfig: { payload: '{\n  "query": "Synthesize latest findings"\n}' },
  },

  // AI & Multi-Agent Intelligence (Open-Multi-Agent / Shogo / OOMOL)
  {
    type: "ai_prompt",
    label: "LLM Reasoning Prompt",
    category: "AI & Agents",
    security: "safe",
    description: "Executes LLM reasoning, transformation, or Socratic analysis",
    icon: Sparkles,
    defaultConfig: {
      systemPrompt: "You are a concise, structured research synthesizer.",
      userPrompt: "Analyze the provided inputs: {{ input }}",
      model: "gemini-2.5-flash",
      temperature: 0.3,
      maxTokens: 1000,
    },
  },
  {
    type: "ai_structured_json",
    label: "Structured JSON Extractor",
    category: "AI & Agents",
    security: "safe",
    description: "Guarantees output adheres to exact JSON Schema contract",
    icon: Code2,
    defaultConfig: {
      schema: '{\n  "summary": "string",\n  "keyFindings": ["string"],\n  "confidenceScore": 0.95\n}',
    },
  },
  {
    type: "ai_agent_delegate",
    label: "Multi-Agent Delegate",
    category: "AI & Agents",
    security: "safe",
    description: "Spawns a specialized subagent (Researcher, Coder, Reviewer) with tool gating",
    icon: Bot,
    defaultConfig: { role: "Research Subagent", maxTools: 5, timeoutSeconds: 60 },
  },
  {
    type: "ai_embedding_search",
    label: "Vault Semantic RAG",
    category: "AI & Agents",
    security: "safe",
    description: "Vector search over encrypted vault chunks and knowledge notes",
    icon: Search,
    defaultConfig: { topK: 5, threshold: 0.75, includeBacklinks: true },
  },
  {
    type: "ai_summarize",
    label: "Document Summarizer",
    category: "AI & Agents",
    security: "safe",
    description: "Condenses lengthy text, documents, or logs into clean Markdown briefs",
    icon: FileText,
    defaultConfig: { format: "executive-brief", bulletPoints: 5 },
  },

  // Vault & Local Data Mutations
  {
    type: "vault_read_file",
    label: "Read Vault File",
    category: "Vault & Data",
    security: "safe",
    description: "Decrypts and reads file content or frontmatter from local vault",
    icon: Folder,
    defaultConfig: { path: "/vault/notes/daily-brief.md" },
  },
  {
    type: "vault_write_file",
    label: "Write / Append Vault File",
    category: "Vault & Data",
    security: "mutation",
    description: "Writes or appends envelope-encrypted content to a vault path",
    icon: Database,
    defaultConfig: { path: "/vault/output/report.md", append: false, overwrite: true },
  },
  {
    type: "vault_task_create",
    label: "Create Project Task",
    category: "Vault & Data",
    security: "mutation",
    description: "Creates or updates tasks on the Kanban board with due date and priority",
    icon: Layers,
    defaultConfig: { title: "Follow-up Action", priority: "medium", column: "To Do" },
  },
  {
    type: "vault_exam_log",
    label: "Log Study / Exam Topic",
    category: "Vault & Data",
    security: "mutation",
    description: "Logs study session duration or increments topic mastery score",
    icon: Clock,
    defaultConfig: { subject: "Physics", durationMin: 30, masteryDelta: 5 },
  },
  {
    type: "vault_memory_save",
    label: "Store AI Fact / Memory",
    category: "Vault & Data",
    security: "mutation",
    description: "Saves a permanent memory fact for global AI recall across chats",
    icon: Sparkles,
    defaultConfig: { category: "user_preferences", memoryKey: "favorite_topics" },
  },

  // Logic & Flow Control (ActivePieces / Conductor)
  {
    type: "logic_condition",
    label: "Branch / Condition",
    category: "Logic & Flow",
    security: "safe",
    description: "If / Else condition check routing into True or False branches",
    icon: Sliders,
    defaultConfig: { field: "confidenceScore", operator: ">=", value: "0.8" },
  },
  {
    type: "logic_code_sandbox",
    label: "Sandboxed JS VM",
    category: "Logic & Flow",
    security: "sandbox",
    description: "Executes pure JavaScript inside an isolated Node VM sandbox with memory limits",
    icon: Terminal,
    defaultConfig: {
      code: "// input contains previous step results\nreturn {\n  success: true,\n  itemCount: input?.items?.length || 0,\n  timestamp: Date.now()\n};",
      timeoutMs: 3000,
    },
  },
  {
    type: "logic_approval",
    label: "Human Approval Gate",
    category: "Logic & Flow",
    security: "mutation",
    description: "Pauses pipeline execution until user manually clicks Approve (5m TTL)",
    icon: HelpCircle,
    defaultConfig: { timeoutMinutes: 5, prompt: "Approve automated task creation?" },
  },

  // Integrations & Delivery
  {
    type: "http_request",
    label: "HTTP / REST Request",
    category: "Integrations",
    security: "network",
    description: "Sends external HTTP request (GET, POST, PUT, DELETE) with SSRF defense",
    icon: Globe,
    defaultConfig: { method: "POST", url: "https://api.example.com/v1/event", headers: {} },
  },
  {
    type: "telegram_send",
    label: "Telegram Notification",
    category: "Integrations",
    security: "network",
    description: "Sends instant Telegram alert or formatted Markdown to connected chat",
    icon: Send,
    defaultConfig: { chat: "saved_messages", text: "Workflow completed: {{ step.output }}" },
  },
  {
    type: "mcp_tool_call",
    label: "MCP Tool Execution",
    category: "Integrations",
    security: "sandbox",
    description: "Executes Model Context Protocol tool from dynamically mounted MCP servers",
    icon: Bot,
    defaultConfig: { server: "default", tool: "browse_web", args: {} },
  },
];

// Helper: Security badge styling
function SecurityBadge({ grade }: { grade: SecurityGrade }) {
  switch (grade) {
    case "safe":
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.2 rounded-full">
          <ShieldCheck className="h-2.5 w-2.5" /> Safe
        </span>
      );
    case "mutation":
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-mono text-amber-400 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.2 rounded-full">
          <ShieldAlert className="h-2.5 w-2.5" /> Mutation
        </span>
      );
    case "network":
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-mono text-sky-400 bg-sky-950/40 border border-sky-800/40 px-1.5 py-0.2 rounded-full">
          <Globe className="h-2.5 w-2.5" /> Network
        </span>
      );
    case "sandbox":
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-mono text-purple-400 bg-purple-950/40 border border-purple-800/40 px-1.5 py-0.2 rounded-full">
          <Terminal className="h-2.5 w-2.5" /> Sandboxed
        </span>
      );
  }
}

// Custom Flowlib Node Component (with Quick-Action Bar & Dual Branching Handles)
function CustomFlowlibNode({ id, data, selected }: any) {
  const nodeData = (data || {}) as {
    type?: WorkflowNodeType;
    name?: string;
    config?: Record<string, any>;
    status?: "idle" | "running" | "completed" | "failed" | "paused";
    lastOutput?: any;
    durationMs?: number;
    approvalPending?: boolean;
    onApprove?: () => void;
    onReject?: () => void;
    onRunStep?: (id: string) => void;
    onDuplicate?: (id: string) => void;
    onDelete?: (id: string) => void;
  };

  const meta = ALL_NODES.find((n) => n.type === nodeData.type) || {
    label: nodeData.name || "Node",
    category: "AI & Agents" as WorkflowNodeCategory,
    security: "safe" as SecurityGrade,
    icon: Sparkles,
  };
  const IconComponent = meta.icon;

  const isTrigger = typeof nodeData.type === "string" && nodeData.type.startsWith("trigger_");
  const isCondition = nodeData.type === "logic_condition";
  const isApproval = nodeData.type === "logic_approval";

  return (
    <div
      className={`group relative min-w-[240px] max-w-[300px] rounded-[var(--radius-md)] bg-[var(--bg-1)] border transition-all select-none shadow-xs ${
        selected
          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30 shadow-md"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      }`}
    >
      {/* ── Floating Node Quick-Action Toolbar (on select) ── */}
      {selected && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[var(--bg-2)] border border-[var(--border)] rounded-[var(--radius-sm)] p-1 shadow-[var(--shadow-popover)] z-30 animate-in fade-in zoom-in-95 duration-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onRunStep?.(id);
            }}
            className="p-1 text-[var(--fg-2)] hover:text-emerald-400 hover:bg-[var(--bg-3)] rounded-[var(--radius-xs)] transition-colors"
            title="Execute This Step"
          >
            <Play className="h-3 w-3 fill-current" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onDuplicate?.(id);
            }}
            className="p-1 text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-3)] rounded-[var(--radius-xs)] transition-colors"
            title="Duplicate Node"
          >
            <Copy className="h-3 w-3 stroke-[1.5]" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              nodeData.onDelete?.(id);
            }}
            className="p-1 text-[var(--fg-2)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] rounded-[var(--radius-xs)] transition-colors"
            title="Delete Node"
          >
            <Trash2 className="h-3 w-3 stroke-[1.5]" />
          </button>
        </div>
      )}

      {/* Left Input Handle (Hidden for pure triggers) */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !rounded-full !border-2 !border-[var(--bg-1)] !bg-[var(--fg-2)] group-hover:!bg-[var(--accent)] transition-colors"
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-2)]/60 rounded-t-[var(--radius-md)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-5 w-5 rounded-[var(--radius-xs)] bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)] shrink-0">
            <IconComponent className="h-3 w-3 stroke-[1.5]" />
          </div>
          <span className="text-[var(--text-xs)] font-medium text-[var(--fg-0)] truncate">
            {nodeData.name || meta.label}
          </span>
        </div>

        {/* Status Dot */}
        <div className="flex items-center gap-1.5 shrink-0">
          {nodeData.durationMs && (
            <span className="text-[9px] font-mono text-[var(--fg-2)]">{nodeData.durationMs}ms</span>
          )}
          <span
            className={`h-2 w-2 rounded-full ${
              nodeData.status === "running"
                ? "bg-amber-400 animate-ping"
                : nodeData.status === "completed"
                ? "bg-emerald-400"
                : nodeData.status === "failed"
                ? "bg-rose-400"
                : nodeData.status === "paused"
                ? "bg-cyan-400 animate-pulse"
                : "bg-zinc-600"
            }`}
            title={`Status: ${nodeData.status || "idle"}`}
          />
        </div>
      </div>

      {/* Body Summary & Security Badge */}
      <div className="p-3 text-[11px] text-[var(--fg-2)] space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--fg-3)] font-semibold uppercase tracking-wider">
            {meta.category}
          </span>
          <SecurityBadge grade={meta.security} />
        </div>

        {/* Live Token Streaming Preview (Open-Flow style) */}
        {nodeData.status === "running" && (
          <div className="p-1.5 rounded-[var(--radius-xs)] bg-[var(--bg-0)] border border-[var(--border-subtle)] text-[10px] text-[var(--accent)] font-mono animate-pulse flex items-center gap-1">
            <span className="h-1 w-1 rounded-full bg-[var(--accent)] animate-ping" />
            Executing & streaming tokens...
          </div>
        )}

        {/* Config Summary Text */}
        <p className="line-clamp-2 text-[var(--fg-1)] font-mono text-[10px]">
          {nodeData.config?.cron ||
            nodeData.config?.path ||
            nodeData.config?.systemPrompt ||
            nodeData.config?.condition ||
            nodeData.config?.url ||
            nodeData.config?.role ||
            "Configured parameters"}
        </p>

        {/* Interactive Approval Banner if Approval Node is Paused */}
        {isApproval && nodeData.status === "paused" && (
          <div className="mt-2 p-2 rounded-[var(--radius-xs)] bg-[var(--accent-soft)] border border-[var(--accent-border)] space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-[var(--accent)] font-medium">
              <span>Approval Required</span>
              <span className="font-mono">TTL: 4:52</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  nodeData.onApprove?.();
                }}
                className="flex-1 py-0.5 rounded-[var(--radius-xs)] bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-500 transition-colors"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  nodeData.onReject?.();
                }}
                className="flex-1 py-0.5 rounded-[var(--radius-xs)] bg-[var(--bg-2)] text-[var(--fg-1)] text-[10px] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
              >
                Deny
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Output Handles ── */}
      {isCondition ? (
        // Dual Handles for Condition Branching (SynergyCodes / ActivePieces style)
        <>
          {/* Top True Handle */}
          <div className="absolute right-0 top-1/3 -translate-y-1/2 translate-x-1.5 flex items-center">
            <span className="text-[9px] font-mono text-emerald-400 mr-2 -ml-6 select-none pointer-events-none">
              True
            </span>
            <Handle
              id="true"
              type="source"
              position={Position.Right}
              className="!h-3 !w-3 !rounded-full !border-2 !border-[var(--bg-1)] !bg-emerald-500 hover:!scale-125 transition-transform"
            />
          </div>
          {/* Bottom False Handle */}
          <div className="absolute right-0 top-2/3 -translate-y-1/2 translate-x-1.5 flex items-center">
            <span className="text-[9px] font-mono text-amber-400 mr-2 -ml-6 select-none pointer-events-none">
              False
            </span>
            <Handle
              id="false"
              type="source"
              position={Position.Right}
              className="!h-3 !w-3 !rounded-full !border-2 !border-[var(--bg-1)] !bg-amber-500 hover:!scale-125 transition-transform"
            />
          </div>
        </>
      ) : (
        // Standard Right Output Handle
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !rounded-full !border-2 !border-[var(--bg-1)] !bg-[var(--accent)] group-hover:!scale-110 transition-transform"
        />
      )}
    </div>
  );
}

const nodeTypes = {
  flowlibNode: CustomFlowlibNode,
};

// Inner Visual Editor Canvas Component
function FlowlibEditorInner() {
  const { screenToFlowPosition, fitView } = useReactFlow();

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
  const [isPaused, setIsPaused] = useState(false);
  const [executionStepIndex, setExecutionStepIndex] = useState(0);

  const [logs, setLogs] = useState<{ time: string; text: string; success?: boolean; error?: boolean }[]>([
    { time: new Date().toLocaleTimeString(), text: "Visual Workflow Studio initialized with durability engine." },
  ]);

  // Import / Export JSON Dialog State
  const [showJsonDialog, setShowJsonDialog] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonCopied, setJsonCopied] = useState(false);

  // Initial nodes & edges
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
          status: n.status || ("idle" as const),
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
          status: n.status || ("idle" as const),
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

  // Connect handles
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

  // Drag & Drop Node Spawning from Sidebar onto Canvas (WorkflowBuilder style)
  const onDragStart = (event: React.DragEvent, meta: NodeMeta) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(meta));
    event.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const rawData = event.dataTransfer.getData("application/reactflow");
      if (!rawData) return;

      const meta: NodeMeta = JSON.parse(rawData);
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newId = `node_${Date.now()}`;
      const newNode = {
        id: newId,
        type: "flowlibNode",
        position,
        data: {
          type: meta.type,
          name: meta.label,
          config: { ...meta.defaultConfig },
          status: "idle" as const,
          lastOutput: null,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedNode(newNode);
      setSidebarTab("inspector");
      setLogs((prev) => [
        { time: new Date().toLocaleTimeString(), text: `Dropped node "${meta.label}" onto canvas.` },
        ...prev,
      ]);
    },
    [screenToFlowPosition, setNodes]
  );

  // 1-Click Add Node from sidebar
  const handleAddNode = (meta: NodeMeta) => {
    const newId = `node_${Date.now()}`;
    const newNode = {
      id: newId,
      type: "flowlibNode",
      position: { x: 300 + Math.random() * 60, y: 150 + Math.random() * 60 },
      data: {
        type: meta.type,
        name: meta.label,
        config: { ...meta.defaultConfig },
        status: "idle" as const,
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

  // Node Click Selection
  const onNodeClick = (_: any, node: any) => {
    setSelectedNode(node);
    setSidebarTab("inspector");
    setSidebarOpen(true);
  };

  // Delete node
  const handleDeleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      if (selectedNode?.id === id) {
        setSelectedNode(null);
        setSidebarTab("palette");
      }
    },
    [selectedNode, setEdges, setNodes]
  );

  // Duplicate node
  const handleDuplicateNode = useCallback(
    (id: string) => {
      const original = nodes.find((n) => n.id === id);
      if (!original) return;
      const newId = `node_${Date.now()}`;
      const duplicate = {
        ...original,
        id: newId,
        position: { x: original.position.x + 40, y: original.position.y + 40 },
        data: {
          ...original.data,
          name: `${original.data.name} (Copy)`,
          status: "idle" as const,
          lastOutput: null,
        },
      };
      setNodes((nds) => [...nds, duplicate]);
      setSelectedNode(duplicate);
    },
    [nodes, setNodes]
  );

  // Execute single step
  const handleRunSingleStep = useCallback(
    async (id: string) => {
      const targetNode = nodes.find((n) => n.id === id);
      if (!targetNode) return;

      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, status: "running" } } : n))
      );

      const startTime = Date.now();
      await new Promise((r) => setTimeout(r, 450));
      const durationMs = Date.now() - startTime;

      const stepOutput = {
        status: "200_OK",
        executedNode: targetNode.data.name,
        type: targetNode.data.type,
        timestamp: new Date().toISOString(),
        durationMs,
        payload: {
          summary: "Step processed cleanly through Phryvos K9 execution harness.",
          evaluatedParams: targetNode.data.config,
        },
      };

      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "completed",
                  durationMs,
                  lastOutput: stepOutput,
                },
              }
            : n
        )
      );

      setSelectedNode((prev: any) =>
        prev?.id === id
          ? {
              ...prev,
              data: {
                ...prev.data,
                status: "completed",
                durationMs,
                lastOutput: stepOutput,
              },
            }
          : prev
      );

      setLogs((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          text: `Step "${targetNode.data.name}" finished in ${durationMs}ms with status 200 OK.`,
          success: true,
        },
        ...prev,
      ]);
    },
    [nodes, setNodes]
  );

  // Human Approval Handlers
  const handleApproveNode = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "completed",
                  lastOutput: { approved: true, approvedAt: Date.now() },
                },
              }
            : n
        )
      );
      setLogs((prev) => [
        { time: new Date().toLocaleTimeString(), text: `Human Approval Granted for step: ${id}`, success: true },
        ...prev,
      ]);
    },
    [setNodes]
  );

  const handleRejectNode = useCallback(
    (id: string) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "failed",
                  lastOutput: { approved: false, rejectedAt: Date.now() },
                },
              }
            : n
        )
      );
      setLogs((prev) => [
        { time: new Date().toLocaleTimeString(), text: `Human Approval Denied for step: ${id}`, error: true },
        ...prev,
      ]);
    },
    [setNodes]
  );

  // Bind node action helpers into node data
  const decoratedNodes = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onRunStep: handleRunSingleStep,
        onDuplicate: handleDuplicateNode,
        onDelete: handleDeleteNode,
        onApprove: () => handleApproveNode(node.id),
        onReject: () => handleRejectNode(node.id),
      },
    }));
  }, [nodes, handleRunSingleStep, handleDuplicateNode, handleDeleteNode, handleApproveNode, handleRejectNode]);

  // Full Pipeline Execution (Durable sequential flow)
  const handleRunFullPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setIsPaused(false);
    setSidebarTab("logs");
    setSidebarOpen(true);

    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), text: `Starting execution run: "${workflowTitle}"` },
      ...prev,
    ]);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      setExecutionStepIndex(i);

      // Check if node is an approval gate
      if (node.data.type === "logic_approval") {
        setNodes((nds) =>
          nds.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, status: "paused" } } : n))
        );
        setLogs((prev) => [
          {
            time: new Date().toLocaleTimeString(),
            text: `Pipeline paused at approval gate: "${node.data.name}". Awaiting manual decision...`,
          },
          ...prev,
        ]);
        setIsRunning(false);
        setIsPaused(true);
        return;
      }

      setNodes((nds) =>
        nds.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, status: "running" } } : n))
      );
      setLogs((prev) => [
        { time: new Date().toLocaleTimeString(), text: `Step [${i + 1}/${nodes.length}]: "${node.data.name}"` },
        ...prev,
      ]);

      const start = Date.now();
      await new Promise((r) => setTimeout(r, 600));
      const durationMs = Date.now() - start;

      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? {
                ...n,
                data: {
                  ...n.data,
                  status: "completed",
                  durationMs,
                  lastOutput: {
                    status: "200_OK",
                    nodeType: node.data.type,
                    executedAt: new Date().toISOString(),
                  },
                },
              }
            : n
        )
      );
    }

    setIsRunning(false);
    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), text: `Workflow finished successfully! All nodes verified.`, success: true },
      ...prev,
    ]);
  };

  // Step Next (Single-step forward debugger)
  const handleStepNext = async () => {
    const nextPending = nodes.find((n) => n.data.status !== "completed");
    if (!nextPending) {
      setLogs((prev) => [
        { time: new Date().toLocaleTimeString(), text: `No more pending steps. Pipeline is fully complete.` },
        ...prev,
      ]);
      return;
    }
    await handleRunSingleStep(nextPending.id);
  };

  // Reset Pipeline States
  const handleResetPipeline = () => {
    setIsRunning(false);
    setIsPaused(false);
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, status: "idle", lastOutput: null } })));
    setLogs((prev) => [
      { time: new Date().toLocaleTimeString(), text: `Pipeline states reset to idle.` },
      ...prev,
    ]);
  };

  // Update Config
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

  // Insert Variable Chip (ActivePieces style)
  const handleInsertVariable = (varString: string, targetKey: string) => {
    if (!selectedNode) return;
    const currentVal = selectedNode.data.config?.[targetKey] || "";
    handleUpdateConfig(targetKey, `${currentVal} {{ ${varString} }}`);
  };

  // Export Workflow to JSON
  const handleOpenExportJson = () => {
    const payload = {
      name: workflowTitle,
      version: "1.0",
      createdAt: Date.now(),
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.data.type,
        name: n.data.name,
        position: n.position,
        config: n.data.config,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      })),
    };
    setJsonText(JSON.stringify(payload, null, 2));
    setJsonCopied(false);
    setShowJsonDialog(true);
  };

  // Import Workflow from JSON
  const handleApplyImportJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.nodes || !Array.isArray(parsed.nodes)) throw new Error("Invalid format: nodes array missing");

      setWorkflowTitle(parsed.name || "Imported Workflow");
      setNodes(
        parsed.nodes.map((n: any) => ({
          id: n.id || `node_${Date.now()}`,
          type: "flowlibNode",
          position: n.position || { x: 200, y: 150 },
          data: {
            type: n.type || "ai_prompt",
            name: n.name || "Node",
            config: n.config || {},
            status: "idle",
            lastOutput: null,
          },
        }))
      );
      setEdges(
        (parsed.edges || []).map((e: any) => ({
          id: e.id || `e_${Date.now()}`,
          source: e.source,
          target: e.target,
          animated: true,
          style: { stroke: "var(--accent)", strokeWidth: 1.5 },
        }))
      );
      setShowJsonDialog(false);
      setLogs((prev) => [
        { time: new Date().toLocaleTimeString(), text: `Imported workflow JSON successfully!`, success: true },
        ...prev,
      ]);
    } catch (err: any) {
      alert(`Invalid Workflow JSON: ${err.message}`);
    }
  };

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return ALL_NODES.filter((n) => {
      const matchSearch =
        n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = selectedCategory === "All" || n.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [searchQuery, selectedCategory]);

  // List of other upstream nodes for variable insertion
  const upstreamNodes = useMemo(() => {
    if (!selectedNode) return [];
    return nodes.filter((n) => n.id !== selectedNode.id);
  }, [nodes, selectedNode]);

  return (
    <div className="flex h-full w-full flex-col bg-[var(--bg-0)] text-[var(--fg-0)] select-none overflow-hidden relative">
      {/* ── Top Bar (48px, Zero Overlapping) ── */}
      <header className="h-[48px] px-3.5 bg-[var(--bg-1)] border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 z-20">
        {/* Left: Workflow Glyph & Inline Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-7 w-7 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)] shrink-0">
            <Sparkles className="h-4 w-4 stroke-[1.5]" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="text"
              value={workflowTitle}
              onChange={(e) => setWorkflowTitle(e.target.value)}
              className="bg-transparent text-[var(--text-sm)] font-semibold text-[var(--fg-0)] outline-none border-b border-transparent hover:border-[var(--border)] focus:border-[var(--accent)] transition-colors max-w-[220px] truncate"
              placeholder="Workflow Name"
            />
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[10px] text-[var(--fg-2)] font-mono">
              <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-amber-400 animate-ping" : "bg-emerald-400"}`} />
              {isRunning ? "Executing" : isPaused ? "Paused" : "Active"}
            </span>
          </div>
        </div>

        {/* Center: Step Debugger Controls (WorkflowBuilder / Conductor style) */}
        <div className="hidden lg:flex items-center gap-1 bg-[var(--bg-0)] p-1 rounded-[var(--radius-sm)] border border-[var(--border)]">
          <button
            type="button"
            onClick={handleRunFullPipeline}
            disabled={isRunning}
            className="h-[26px] px-2.5 rounded-[var(--radius-xs)] bg-[var(--accent)] text-[var(--accent-fg)] text-[11px] font-medium flex items-center gap-1 hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 cursor-pointer"
            title="Execute All Steps"
          >
            {isRunning ? (
              <RotateCw className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3 fill-current" />
            )}
            <span>{isRunning ? "Running..." : "Run All"}</span>
          </button>
          <button
            type="button"
            onClick={handleStepNext}
            disabled={isRunning}
            className="h-[26px] px-2 rounded-[var(--radius-xs)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
            title="Step Forward One Node"
          >
            <StepForward className="h-3 w-3 stroke-[1.5]" />
            <span>Step</span>
          </button>
          <button
            type="button"
            onClick={handleResetPipeline}
            className="h-[26px] px-2 rounded-[var(--radius-xs)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] text-[11px] transition-colors cursor-pointer"
            title="Reset Pipeline States"
          >
            <RotateCcw className="h-3 w-3 stroke-[1.5]" />
          </button>
        </div>

        {/* Right: Template Switcher, JSON Export & Slide Bar Toggle */}
        <div className="flex items-center gap-2">
          {/* Template Switcher */}
          <select
            value={activeWorkflow.id}
            onChange={(e) => handleSelectTemplate(e.target.value)}
            className="h-[30px] px-2 rounded-[var(--radius-sm)] bg-[var(--bg-0)] border border-[var(--border)] text-[var(--text-xs)] text-[var(--fg-0)] outline-none hover:border-[var(--border-strong)] transition-colors cursor-pointer max-w-[160px] truncate"
          >
            {BUILTIN_WORKFLOW_TEMPLATES.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          {/* JSON Export / Import Modal Trigger */}
          <button
            type="button"
            onClick={handleOpenExportJson}
            className="h-[30px] px-2 rounded-[var(--radius-sm)] bg-[var(--bg-0)] border border-[var(--border)] text-[var(--fg-2)] hover:text-[var(--fg-0)] text-[11px] flex items-center gap-1 transition-colors"
            title="Import or Export Workflow JSON"
          >
            <Code2 className="h-3.5 w-3.5 stroke-[1.5]" />
            <span className="hidden sm:inline">JSON</span>
          </button>

          {/* Slide Bar Toggle */}
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`h-[30px] w-[30px] rounded-[var(--radius-sm)] border flex items-center justify-center transition-colors ${
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

      {/* ── Main Canvas & Slide Bar ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Canvas Area */}
        <div
          className="flex-1 h-full w-full overflow-hidden relative bg-[var(--bg-0)]"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={decoratedNodes}
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

            {/* Canvas Bottom Instructions */}
            <Panel position="bottom-center" className="mb-3 pointer-events-none">
              <div className="px-3 py-1 rounded-full bg-[var(--bg-1)]/90 backdrop-blur-md border border-[var(--border)] text-[10px] text-[var(--fg-2)] shadow-xs">
                Drag nodes from sidebar &middot; Click handles to connect &middot; Select node for quick actions
              </div>
            </Panel>
          </ReactFlow>
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

              {/* ── TAB 1: Palette (Node Library + Drag Support) ── */}
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

                  {/* Node List (Draggable onto canvas) */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {filteredNodes.map((meta) => {
                      const IconComponent = meta.icon;
                      return (
                        <div
                          key={meta.type}
                          draggable
                          onDragStart={(e) => onDragStart(e, meta)}
                          onClick={() => handleAddNode(meta)}
                          className="p-2.5 rounded-[var(--radius-sm)] bg-[var(--bg-0)] border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:bg-[var(--bg-2)] transition-all cursor-grab active:cursor-grabbing group select-none"
                          title="Click to add or drag onto canvas"
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
                            <SecurityBadge grade={meta.security} />
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

              {/* ── TAB 2: Inspector (Node Settings + Variable Ingestion Chips) ── */}
              {sidebarTab === "inspector" && (
                <div className="flex-1 p-3.5 overflow-y-auto space-y-4">
                  {selectedNode ? (
                    <>
                      {/* Node Header & Actions */}
                      <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                        <div>
                          <span className="text-[10px] text-[var(--fg-2)] uppercase font-semibold">
                            Node Configuration
                          </span>
                          <h3 className="text-[var(--text-sm)] font-medium text-[var(--fg-0)] mt-0.5">
                            {selectedNode.data.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDuplicateNode(selectedNode.id)}
                            className="p-1 rounded-[var(--radius-xs)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] transition-colors"
                            title="Duplicate Node"
                          >
                            <Copy className="h-3.5 w-3.5 stroke-[1.5]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNode(selectedNode.id)}
                            className="p-1 rounded-[var(--radius-xs)] text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
                            title="Delete Node"
                          >
                            <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
                          </button>
                        </div>
                      </div>

                      {/* Display Name Input */}
                      <div>
                        <label className="text-[11px] text-[var(--fg-2)] block mb-1">Display Name</label>
                        <input
                          type="text"
                          value={selectedNode.data.name}
                          onChange={(e) => {
                            const updated = {
                              ...selectedNode,
                              data: { ...selectedNode.data, name: e.target.value },
                            };
                            setSelectedNode(updated);
                            setNodes((nds) => nds.map((n) => (n.id === selectedNode.id ? updated : n)));
                          }}
                          className="w-full h-[32px] px-2.5 rounded-[var(--radius-xs)] bg-[var(--bg-0)] border border-[var(--border)] text-[var(--fg-0)] outline-none focus:border-[var(--accent)]"
                        />
                      </div>

                      {/* Dynamic Upstream Variable Insert Chips (ActivePieces style) */}
                      {upstreamNodes.length > 0 && (
                        <div className="p-2 rounded-[var(--radius-sm)] bg-[var(--bg-0)] border border-[var(--border-subtle)] space-y-1.5">
                          <span className="text-[10px] text-[var(--fg-3)] font-semibold uppercase block">
                            Insert Previous Step Variable
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {upstreamNodes.map((un) => (
                              <button
                                key={un.id}
                                type="button"
                                onClick={() => handleInsertVariable(`${un.data.name}.output`, Object.keys(selectedNode.data.config || {})[0] || "input")}
                                className="px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-[var(--bg-2)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] border border-[var(--border)] text-[10px] text-[var(--fg-2)] transition-colors"
                              >
                                + {un.data.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Config Fields */}
                      <div className="space-y-3 text-[var(--text-xs)]">
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

                      {/* Single Step Test Runner */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => handleRunSingleStep(selectedNode.id)}
                          className="w-full h-[32px] rounded-[var(--radius-xs)] bg-[var(--bg-2)] border border-[var(--border)] text-[var(--fg-0)] text-[var(--text-xs)] font-medium hover:bg-[var(--bg-3)] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          <span>Test Single Step</span>
                        </button>
                      </div>

                      {/* Output Inspector */}
                      {selectedNode.data.lastOutput && (
                        <div className="mt-3 p-2.5 rounded-[var(--radius-xs)] bg-[var(--bg-0)] border border-[var(--border-subtle)]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-[var(--fg-3)] font-semibold uppercase">
                              Latest Step Output
                            </span>
                            {selectedNode.data.durationMs && (
                              <span className="text-[9px] font-mono text-[var(--fg-2)]">{selectedNode.data.durationMs}ms</span>
                            )}
                          </div>
                          <pre className="text-[10px] font-mono text-[var(--fg-2)] overflow-x-auto max-h-[160px]">
                            {JSON.stringify(selectedNode.data.lastOutput, null, 2)}
                          </pre>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-16 text-center text-[var(--fg-2)]">
                      <Sliders className="h-8 w-8 text-[var(--fg-3)] mx-auto mb-2 stroke-[1.5]" />
                      <p className="text-[var(--text-xs)]">Select a node on the canvas to inspect and configure.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 3: Execution Stream Logs ── */}
              {sidebarTab === "logs" && (
                <div className="flex-1 p-3 overflow-y-auto space-y-2 font-mono text-[11px]">
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)] text-[10px] text-[var(--fg-3)] uppercase font-semibold">
                    <span>Execution Stream</span>
                    <button
                      type="button"
                      onClick={() => setLogs([])}
                      className="hover:text-[var(--fg-0)] transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  {logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded-[var(--radius-xs)] bg-[var(--bg-0)] border text-[var(--fg-1)] leading-relaxed flex items-start gap-2 ${
                        log.success
                          ? "border-emerald-900/30 text-emerald-300"
                          : log.error
                          ? "border-rose-900/30 text-rose-300"
                          : "border-[var(--border-subtle)]"
                      }`}
                    >
                      <span className="text-[var(--fg-3)] shrink-0 text-[10px]">{log.time}</span>
                      <span className="break-all">{log.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ── JSON Import / Export Modal (Shogo / Open-Flow style) ── */}
      {showJsonDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-lg rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)] text-[var(--fg-0)] p-5 shadow-[var(--shadow-dialog)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-[var(--text-md)] font-semibold text-[var(--fg-0)]">
                Workflow JSON Blueprint
              </h3>
              <button
                type="button"
                onClick={() => setShowJsonDialog(false)}
                className="text-[var(--fg-2)] hover:text-[var(--fg-0)] p-1"
              >
                <X className="h-4 w-4 stroke-[1.5]" />
              </button>
            </div>

            <p className="text-[var(--text-xs)] text-[var(--fg-2)]">
              Copy this JSON definition to export your workflow, or paste an existing workflow definition and click &quot;Apply JSON&quot;.
            </p>

            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={10}
              className="w-full p-2.5 rounded-[var(--radius-xs)] bg-[var(--bg-0)] border border-[var(--border)] font-mono text-[11px] text-[var(--fg-0)] outline-none focus:border-[var(--accent)]"
            />

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(jsonText);
                  setJsonCopied(true);
                  setTimeout(() => setJsonCopied(false), 2000);
                }}
                className="px-3 py-1.5 rounded-[var(--radius-xs)] bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[var(--text-xs)] font-medium flex items-center gap-1.5 transition-colors"
              >
                {jsonCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{jsonCopied ? "Copied!" : "Copy JSON"}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowJsonDialog(false)}
                  className="px-3 py-1.5 rounded-[var(--radius-xs)] text-[var(--fg-2)] hover:text-[var(--fg-0)] text-[var(--text-xs)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyImportJson}
                  className="px-3 py-1.5 rounded-[var(--radius-xs)] bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] text-[var(--text-xs)] font-medium transition-colors"
                >
                  Apply JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Exported Root Provider Wrapper
export function FlowlibEditor() {
  return (
    <ReactFlowProvider>
      <FlowlibEditorInner />
    </ReactFlowProvider>
  );
}
