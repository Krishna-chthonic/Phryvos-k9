/**
 * Phryvos-K9 Workflow Engine & Visual Canvas Types
 * Clean, general-purpose local automation, AI multi-agent orchestration, and vault pipelines.
 */

export type WorkflowNodeCategory =
  | "Trigger"
  | "AI & Agents"
  | "Vault & Data"
  | "Logic & Flow"
  | "Integrations";

export type WorkflowNodeType =
  // Triggers
  | "trigger_schedule"
  | "trigger_webhook"
  | "trigger_vault_event"
  | "trigger_telegram"
  | "trigger_manual"
  // AI & Agents
  | "ai_prompt"
  | "ai_structured_json"
  | "ai_agent_delegate"
  | "ai_summarize"
  | "ai_embedding_search"
  | "ai_script"
  | "ai_video_gen"
  | "ai_tts_voice"
  // Vault & Data
  | "vault_read_file"
  | "vault_write_file"
  | "vault_task_create"
  | "vault_exam_log"
  | "vault_memory_save"
  // Logic & Flow
  | "logic_condition"
  | "logic_loop"
  | "logic_approval"
  | "logic_code_sandbox"
  | "ffmpeg_stitch"
  | "bash_script"
  | "web_scrape"
  // Integrations
  | "http_request"
  | "telegram_send"
  | "telegram_notify"
  | "youtube_publish"
  | "mcp_tool_call";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  position: { x: number; y: number };
  config: Record<string, any>;
  status?: "idle" | "running" | "completed" | "failed" | "paused";
  lastOutput?: any;
  durationMs?: number;
  error?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  category: "study" | "vault" | "agents" | "automation" | "video" | "social" | "devops" | string;
  status?: "active" | "draft" | "paused";
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: number;
  updatedAt: number;
}

export const BUILTIN_WORKFLOW_TEMPLATES: Workflow[] = [
  {
    id: "autonomous-study-curator",
    name: "Autonomous Study & Exam Curator",
    description: "Evaluates upcoming exam topics, generates targeted spaced-repetition notes, updates mastery rating, and sends a daily morning brief.",
    category: "study",
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: [
      {
        id: "node_trigger",
        type: "trigger_schedule",
        name: "Morning 07:00 AM Cron",
        position: { x: 60, y: 180 },
        config: { cron: "0 7 * * *", interval: "Every morning at 7:00 AM" },
      },
      {
        id: "node_read_topics",
        type: "vault_read_file",
        name: "Read JEE Syllabus Matrix",
        position: { x: 340, y: 180 },
        config: { path: "/exams/syllabus-targets.json" },
      },
      {
        id: "node_ai_curator",
        type: "ai_prompt",
        name: "Curate Spaced Repetition Cards",
        position: { x: 620, y: 180 },
        config: {
          systemPrompt: "You are an expert tutor. Given exam topics and mastery levels, generate 5 challenging conceptual questions with Socratic hints.",
          model: "gemini-2.5-flash",
          temperature: 0.3,
        },
      },
      {
        id: "node_save_vault",
        type: "vault_write_file",
        name: "Write Daily Review Note",
        position: { x: 920, y: 100 },
        config: { path: "/vault/study/daily-review.md", append: false },
      },
      {
        id: "node_telegram_brief",
        type: "telegram_send",
        name: "Dispatch Morning Telegram Brief",
        position: { x: 920, y: 260 },
        config: { channel: "Saved Messages", includeSummary: true },
      },
    ],
    edges: [
      { id: "e1", source: "node_trigger", target: "node_read_topics" },
      { id: "e2", source: "node_read_topics", target: "node_ai_curator" },
      { id: "e3", source: "node_ai_curator", target: "node_save_vault" },
      { id: "e4", source: "node_ai_curator", target: "node_telegram_brief" },
    ],
  },
  {
    id: "vault-knowledge-ingestion",
    name: "Vault Knowledge Ingestion & Graph Linker",
    description: "Monitors new markdown documents, extracts [[wiki-links]] and tags, calculates conceptual backlinks, and updates the knowledge graph.",
    category: "vault",
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: [
      {
        id: "node_watch",
        type: "trigger_vault_event",
        name: "Vault File Created / Modified",
        position: { x: 60, y: 160 },
        config: { folder: "/vault/notes", extensions: [".md", ".txt"] },
      },
      {
        id: "node_extract",
        type: "ai_structured_json",
        name: "Extract Entities & [[Links]]",
        position: { x: 340, y: 160 },
        config: { schema: "{ tags: string[], links: string[], summary: string }" },
      },
      {
        id: "node_sandbox_graph",
        type: "logic_code_sandbox",
        name: "Compute DAG Backlinks",
        position: { x: 620, y: 160 },
        config: { runtime: "javascript", sandboxTimeoutMs: 2000 },
      },
      {
        id: "node_update_memory",
        type: "vault_memory_save",
        name: "Store Persistent Memory Key",
        position: { x: 900, y: 160 },
        config: { category: "knowledge-graph" },
      },
    ],
    edges: [
      { id: "e1", source: "node_watch", target: "node_extract" },
      { id: "e2", source: "node_extract", target: "node_sandbox_graph" },
      { id: "e3", source: "node_sandbox_graph", target: "node_update_memory" },
    ],
  },
  {
    id: "multi-agent-research",
    name: "Multi-Agent Deep Research Pipeline",
    description: "Takes complex user research queries, decomposes them into sub-questions, executes parallel web & vault queries, and synthesizes a verified report.",
    category: "agents",
    status: "draft",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: [
      {
        id: "node_trigger_query",
        type: "trigger_manual",
        name: "Manual Research Prompt",
        position: { x: 60, y: 180 },
        config: { prompt: "Research quantum error correction advances" },
      },
      {
        id: "node_decompose",
        type: "ai_prompt",
        name: "Query Decomposition Agent",
        position: { x: 340, y: 180 },
        config: { systemPrompt: "Break this research goal into 3 orthogonal sub-questions." },
      },
      {
        id: "node_delegate_web",
        type: "ai_agent_delegate",
        name: "Web Investigator Agent",
        position: { x: 620, y: 90 },
        config: { agentRole: "Web Researcher", maxTools: 5 },
      },
      {
        id: "node_delegate_vault",
        type: "ai_embedding_search",
        name: "Vault Semantic Vector Search",
        position: { x: 620, y: 270 },
        config: { topK: 5, threshold: 0.75 },
      },
      {
        id: "node_synthesize",
        type: "ai_prompt",
        name: "Report Synthesizer Agent",
        position: { x: 920, y: 180 },
        config: { format: "markdown", includeCitations: true },
      },
    ],
    edges: [
      { id: "e1", source: "node_trigger_query", target: "node_decompose" },
      { id: "e2", source: "node_decompose", target: "node_delegate_web" },
      { id: "e3", source: "node_decompose", target: "node_delegate_vault" },
      { id: "e4", source: "node_delegate_web", target: "node_synthesize" },
      { id: "e5", source: "node_delegate_vault", target: "node_synthesize" },
    ],
  },
  {
    id: "webhook-task-dispatcher",
    name: "Webhook Incident & Task Ingestion",
    description: "Receives external webhooks, runs validation, evaluates priority, and creates a tracked task on the Kanban board with time estimates.",
    category: "automation",
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: [
      {
        id: "node_wh",
        type: "trigger_webhook",
        name: "Inbound HTTP Webhook",
        position: { x: 60, y: 160 },
        config: { path: "/api/workflows/webhook/ingest", auth: "bearer-token" },
      },
      {
        id: "node_condition",
        type: "logic_condition",
        name: "Is Priority High?",
        position: { x: 340, y: 160 },
        config: { field: "priority", operator: "equals", value: "high" },
      },
      {
        id: "node_task",
        type: "vault_task_create",
        name: "Create Project Task",
        position: { x: 620, y: 160 },
        config: { projectId: "ops", column: "To Do" },
      },
    ],
    edges: [
      { id: "e1", source: "node_wh", target: "node_condition" },
      { id: "e2", source: "node_condition", target: "node_task" },
    ],
  },
];
