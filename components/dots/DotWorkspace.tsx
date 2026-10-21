"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Monitor,
  BookOpen,
  Settings2,
  Phone,
  ArrowUp,
  Terminal,
  PanelLeft,
  Menu,
  Clock,
  ScrollText,
  Layers,
  X,
  ChevronDown,
  Check,
  Bot,
  Users,
  ShieldAlert,
  Trash2,
  Workflow,
  Sparkles,
} from "lucide-react";
import { DotMascot } from "./DotMascot";
import { DotComputerPanel } from "./DotComputerPanel";
import { DotSpacesPanel } from "./DotSpacesPanel";
import { DotTasksPanel } from "./DotTasksPanel";
import { RecipesPanel } from "./RecipesPanel";
import { SwarmCoordinatorPanel } from "./SwarmCoordinatorPanel";
import { PaperclipOrgPanel } from "./PaperclipOrgPanel";
import { FlowlibEditor } from "@/components/workflows/FlowlibEditor";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { AssistantBody } from "@/components/chat/AssistantBody";
import type { DotDto, DotMessageDto, DotSpaceDto } from "@/lib/dots-service";
import type { ProviderMeta } from "@/lib/chat-client";

interface DotWorkspaceProps {
  dot: DotDto;
  messages: DotMessageDto[];
  spaces: DotSpaceDto[];
  onSendMessage: (content: string) => void;
  onRefreshSpaces: () => void;
  onOpenCall: () => void;
  onToggleRoster: () => void;
  onToggleDesktopRoster: () => void;
  desktopRosterOpen: boolean;
  streaming: boolean;
  streamText: string;
  pendingApproval?: {
    id: string;
    tool: string;
    description: string;
  } | null;
  onResolveApproval?: (id: string, decision: "allow" | "deny") => void;
  onDeleteDot?: (id: string) => void;
  onUpdateDot: (updates: Partial<DotDto>) => void;
  providers: ProviderMeta[];
  providerId: number | "";
  selectedModel: string;
  onSelectProvider: (id: number | "") => void;
  onSelectModel: (m: string) => void;
}

export type WorkspaceTabId =
  | "chat"
  | "tasks"
  | "workflows"
  | "computer"
  | "spaces"
  | "recipes"
  | "swarm"
  | "paperclip"
  | "settings";

interface ModuleConfig {
  id: WorkspaceTabId;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  badge?: string;
  pulse?: boolean;
}

const MODULES: ModuleConfig[] = [
  {
    id: "chat",
    label: "Direct Chat",
    shortLabel: "Chat",
    description: "Live conversation, memory injection & audio calls with Dot",
    icon: MessageSquare,
    iconColor: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
  },
  {
    id: "workflows",
    label: "Graph Automations",
    shortLabel: "Flows",
    description: "Visual node pipelines, video rendering, YouTube auto-publishers",
    icon: Workflow,
    iconColor: "text-purple-500 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
    badge: "DAG",
  },
  {
    id: "tasks",
    label: "Autonomous Tasks",
    shortLabel: "Tasks",
    description: "Cron-like scheduled heartbeats and recurring agent workflows",
    icon: Clock,
    iconColor: "text-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
    pulse: true,
  },
  {
    id: "computer",
    label: "Termux Computer",
    shortLabel: "Computer",
    description: "Native Linux shell execution, OpenClaw tools & browser actions",
    icon: Monitor,
    iconColor: "text-blue-500 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
    badge: "CLI",
  },
  {
    id: "spaces",
    label: "Knowledge Spaces",
    shortLabel: "Spaces",
    description: "Document storage, knowledge bases & shared agent context",
    icon: BookOpen,
    iconColor: "text-purple-500 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
  },
  {
    id: "recipes",
    label: "Goose Automation Recipes",
    shortLabel: "Recipes",
    description: "Multi-step agent playbooks and automated recipe runners",
    icon: ScrollText,
    iconColor: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
  },
  {
    id: "swarm",
    label: "Ruflo Swarm Coordinator",
    shortLabel: "Swarm",
    description: "Hierarchical multi-agent delegation & parallel swarm tasking",
    icon: Bot,
    iconColor: "text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800",
    badge: "16-Repo",
  },
  {
    id: "paperclip",
    label: "Paperclip Org & Cost",
    shortLabel: "Org & Cost",
    description: "Virtual AI organization hierarchy, token quotas & budget tracker",
    icon: Users,
    iconColor: "text-cyan-500 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800",
  },
  {
    id: "settings",
    label: "Dot Instructions & Persona",
    shortLabel: "Settings",
    description: "Customize system directives, working directory & tool allowances",
    icon: Settings2,
    iconColor: "text-zinc-600 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700",
  },
];

export function DotWorkspace({
  dot,
  messages,
  spaces,
  onSendMessage,
  onRefreshSpaces,
  onOpenCall,
  onToggleRoster,
  onToggleDesktopRoster,
  desktopRosterOpen,
  streaming,
  streamText,
  pendingApproval,
  onResolveApproval,
  onDeleteDot,
  onUpdateDot,
  providers,
  providerId,
  selectedModel,
  onSelectProvider,
  onSelectModel,
}: DotWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>("chat");
  const [modulesDrawerOpen, setModulesDrawerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Auto scroll transcript
  useEffect(() => {
    if (activeTab === "chat") {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, streamText, activeTab]);

  const handleSend = () => {
    if (!draft.trim() || streaming) return;
    onSendMessage(draft.trim());
    setDraft("");
  };

  const handleAskDotToReview = (docTitle: string, docContent: string) => {
    setActiveTab("chat");
    onSendMessage(
      `Please review this document titled "${docTitle}":\n\n\`\`\`markdown\n${docContent}\n\`\`\`\n\nProvide constructive feedback, identify potential gaps, and suggest concrete enhancements.`
    );
  };

  const currentProv = providers.find((p) => p.id === providerId) ?? providers[0];
  const modelOptions = currentProv?.models ?? [];
  const currentModule = MODULES.find((m) => m.id === activeTab) || MODULES[0];
  const CurrentIcon = currentModule.icon;

  return (
    <div className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Unified Non-Overflowing Single Top Bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800 px-2 sm:px-3 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md gap-1.5 sm:gap-2 z-10">
        {/* Left: 3 Slide Triggers (Main Menu, Coworkers, Workspace Modules) + Dot Identity */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 min-w-0">
          {/* Slide Option 1: Mobile Main App Menu */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("phryvos:open-menu"))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-zinc-100 active:scale-95 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 md:hidden shrink-0 cursor-pointer"
            title="Slide 1: Open Main Navigation Menu"
            aria-label="Open Navigation Menu"
          >
            <Menu className="h-4 w-4" />
          </button>

          {/* Slide Option 2: Mobile Coworkers Roster */}
          <button
            onClick={onToggleRoster}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-zinc-100 active:scale-95 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 md:hidden shrink-0 cursor-pointer"
            title="Slide 2: Toggle Coworkers Roster"
            aria-label="Toggle Coworkers"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          {/* Slide Option 2 (Desktop): Coworkers sidebar toggle */}
          <button
            onClick={onToggleDesktopRoster}
            className="hidden md:flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 transition shrink-0 cursor-pointer"
            title="Slide 2: Toggle Coworkers sidebar"
          >
            <PanelLeft className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{desktopRosterOpen ? "Hide" : "Coworkers"}</span>
          </button>

          {/* Slide Option 3: Dedicated Workspace Modules Drawer Trigger (User Mandate) */}
          <button
            onClick={() => setModulesDrawerOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 active:scale-95 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60 transition shrink-0 cursor-pointer"
            title="Slide 3: Open Workspace Modules Drawer (Chat, Tasks, Computer, Spaces, Swarm, etc.)"
            aria-label="Open Workspace Modules"
          >
            <Layers className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden xs:inline font-medium">Modules</span>
          </button>

          {/* Dot Mascot & Identity */}
          <div className="flex items-center gap-1.5 min-w-0 pl-1 border-l border-zinc-200 dark:border-zinc-800">
            <DotMascot character={dot.character} size="small" state={dot.status} className="w-7 h-7 shrink-0" />
            <div className="min-w-0 hidden sm:block">
              <div className="flex items-center gap-1">
                <span className="truncate text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  {dot.name}
                </span>
                <span className="hidden md:inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300 capitalize">
                  {dot.status}
                </span>
                <span
                  onClick={() => navigator.clipboard?.writeText(`/${dot.name.toLowerCase()}`)}
                  className="hidden xl:inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-semibold text-sky-700 border border-sky-200/60 dark:bg-sky-950/40 dark:border-sky-800/60 dark:text-sky-300 font-mono cursor-pointer hover:bg-sky-100 dark:hover:bg-sky-900/50 transition"
                  title="Click to copy Telegram command for this Dot"
                >
                  📱 /{dot.name.toLowerCase()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Sleek Active Module Trigger Pill (Never Overflows) */}
        <div className="flex items-center justify-center min-w-0">
          <button
            onClick={() => setModulesDrawerOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-zinc-100/80 px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-200/70 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition active:scale-95 cursor-pointer shadow-2xs"
            title="Click to switch workspace module"
          >
            <CurrentIcon className="h-3.5 w-3.5 text-indigo-500" />
            <span className="truncate max-w-[90px] xs:max-w-[130px] sm:max-w-none">
              {currentModule.label}
            </span>
            <ChevronDown className="h-3 w-3 text-zinc-400 shrink-0" />
          </button>
        </div>

        {/* Right: Model Selector & Call Button */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 min-w-0">
          {/* Provider selector if multiple */}
          {providers.length > 1 && (
            <select
              value={String(providerId)}
              onChange={(e) => onSelectProvider(e.target.value === "" ? "" : Number(e.target.value))}
              className="h-8 max-w-[75px] sm:max-w-[95px] truncate rounded-lg border border-zinc-200 bg-zinc-50 px-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none cursor-pointer hidden lg:block"
              title="AI Provider"
            >
              <option value="">Provider</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {/* Model selector */}
          {modelOptions.length > 0 && (
            <select
              value={selectedModel || (dot.model !== "auto" ? dot.model : modelOptions[0])}
              onChange={(e) => onSelectModel(e.target.value)}
              className="h-8 max-w-[80px] xs:max-w-[105px] sm:max-w-[135px] truncate rounded-lg border border-zinc-200 bg-zinc-50 px-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none cursor-pointer"
              title="AI Model"
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}

          {/* Voice Call Button */}
          <button
            onClick={onOpenCall}
            className="flex h-8 items-center justify-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-50 px-2 sm:px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300 transition shadow-2xs active:scale-95 cursor-pointer shrink-0"
            title={`Voice call with ${dot.name}`}
          >
            <Phone className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Call</span>
          </button>
        </div>
      </div>

      {/* Slide Option 3: Dedicated Modules Slide Drawer */}
      {modulesDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in-50 duration-200"
            onClick={() => setModulesDrawerOpen(false)}
          />

          {/* Slide Drawer Panel */}
          <div className="relative w-full max-w-sm sm:max-w-md bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl h-full flex flex-col z-10 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                    Workspace Modules
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Active Dot: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{dot.name}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setModulesDrawerOpen(false)}
                className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-300 transition cursor-pointer"
                title="Close drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modules List */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
              {MODULES.map((mod) => {
                const Icon = mod.icon;
                const isSelected = activeTab === mod.id;

                return (
                  <button
                    key={mod.id}
                    onClick={() => {
                      setActiveTab(mod.id);
                      setModulesDrawerOpen(false);
                    }}
                    className={`w-full flex items-start gap-3 p-3 rounded-2xl border text-left transition-all duration-150 active:scale-[0.99] cursor-pointer ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 dark:border-indigo-600 shadow-xs"
                        : "border-zinc-200/80 bg-zinc-50/50 hover:bg-zinc-100/70 dark:border-zinc-800/80 dark:bg-zinc-900/50 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <div
                      className={`p-2 rounded-xl border shrink-0 transition-transform ${mod.iconColor}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`font-semibold text-xs ${
                            isSelected
                              ? "text-indigo-600 dark:text-indigo-400"
                              : "text-zinc-900 dark:text-zinc-100"
                          }`}
                        >
                          {mod.label}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {mod.id === "spaces" && spaces.length > 0 && (
                            <span className="rounded-full bg-purple-100 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-800 px-1.5 py-0.2 text-[9px] font-bold text-purple-700 dark:text-purple-300">
                              {spaces.length} spaces
                            </span>
                          )}
                          {mod.pulse && (
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          )}
                          {mod.badge && (
                            <span className="rounded-full bg-zinc-200/80 dark:bg-zinc-800 px-1.5 py-0.2 text-[9px] font-semibold text-zinc-700 dark:text-zinc-300">
                              {mod.badge}
                            </span>
                          )}
                          {isSelected && (
                            <Check className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">
                        {mod.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer with quick info */}
            <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 text-center text-[10px] text-zinc-400">
              Phryvos-K9 Workspace • Slide option 3 for quick navigation
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {activeTab === "chat" && (
          <div className="flex h-full flex-col">
            {/* Transcript Area */}
            <div ref={listRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {messages.length === 0 && !streamText ? (
                /* Hero Mascot Welcome */
                <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center p-4">
                  <div className="relative mb-2">
                    <DotMascot character={dot.character} size="hero" state={dot.status} />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                    {dot.name} is ready to work
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed">
                    {dot.description || dot.role}
                  </p>

                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    <button
                      onClick={() =>
                        onSendMessage("Give me a brief breakdown of your capabilities and how we can work together.")
                      }
                      className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition cursor-pointer"
                    >
                      💡 Explore capabilities
                    </button>
                    <button
                      onClick={() =>
                        onSendMessage("Inspect your current virtual working directory and show me your environment status.")
                      }
                      className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition cursor-pointer"
                    >
                      💻 Inspect virtual environment
                    </button>
                  </div>
                </div>
              ) : (
                messages.map((m) => {
                  if (m.role === "tool") {
                    return (
                      <div
                        key={m.id}
                        className="my-2 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/60 font-mono"
                      >
                        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 font-semibold mb-1">
                          <Terminal className="h-3.5 w-3.5 text-emerald-500" />
                          <span>Tool: {m.toolName || "execution"}</span>
                        </div>
                        <div className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed text-[11px]">
                          {m.content}
                        </div>
                      </div>
                    );
                  }

                  const isUser = m.role === "user";
                  return (
                    <div
                      key={m.id}
                      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      {!isUser && (
                        <DotMascot character={dot.character} size="small" className="mt-1 w-7 h-7" />
                      )}
                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          isUser
                            ? "bg-zinc-900 text-white border border-zinc-900 dark:bg-zinc-800 dark:border-zinc-700/80 dark:text-zinc-100 shadow-2xs"
                            : "bg-zinc-100 text-zinc-900 border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100 shadow-2xs"
                        }`}
                      >
                        {isUser ? (
                          <MarkdownRenderer>{m.content}</MarkdownRenderer>
                        ) : (
                          <AssistantBody body={m.content} />
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Streaming Assistant Bubble */}
              {streaming && streamText && (
                <div className="flex gap-3 justify-start">
                  <DotMascot character={dot.character} size="small" state="working" className="mt-1 w-7 h-7" />
                  <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-zinc-100 text-zinc-900 border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100 shadow-2xs">
                    <AssistantBody body={streamText} streaming={true} />
                  </div>
                </div>
              )}
            </div>

            {/* Pending Tool Approval Banner */}
            {pendingApproval && (
              <div className="shrink-0 px-4 py-3 bg-amber-50/90 dark:bg-amber-950/40 border-t border-amber-200 dark:border-amber-800 animate-in fade-in slide-in-from-bottom-2">
                <div className="mx-auto max-w-4xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        Action Requires Confirmation: <span className="font-mono text-amber-700 dark:text-amber-300">{pendingApproval.tool}</span>
                      </div>
                      <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                        {pendingApproval.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      onClick={() => onResolveApproval?.(pendingApproval.id, "deny")}
                      className="px-3 py-1.5 rounded-xl border border-zinc-300 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 cursor-pointer transition active:scale-95"
                    >
                      Deny
                    </button>
                    <button
                      onClick={() => onResolveApproval?.(pendingApproval.id, "allow")}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs cursor-pointer transition active:scale-95"
                    >
                      Approve & Run
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Composer */}
            <div className="shrink-0 border-t border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 sm:p-4">
              <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-3xl border border-zinc-300 bg-white p-2 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  placeholder={`Assign a task or message ${dot.name}…`}
                  className="max-h-36 min-h-[38px] w-full resize-none bg-transparent px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                />

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!draft.trim() || streaming}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 shadow-md ${
                    draft.trim() && !streaming
                      ? "bg-zinc-900 text-white hover:bg-zinc-800 active:scale-95 cursor-pointer dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-500"
                      : "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed"
                  }`}
                >
                  <ArrowUp className="h-5 w-5 stroke-[2.5]" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "workflows" && (
          <div className="h-full w-full overflow-hidden">
            <FlowlibEditor />
          </div>
        )}

        {activeTab === "tasks" && <DotTasksPanel dot={dot} onRefreshMessages={onRefreshSpaces} />}

        {activeTab === "recipes" && <RecipesPanel dot={dot} />}

        {activeTab === "swarm" && <SwarmCoordinatorPanel dot={dot} />}

        {activeTab === "paperclip" && <PaperclipOrgPanel />}

        {activeTab === "computer" && <DotComputerPanel dot={dot} />}

        {activeTab === "spaces" && (
          <DotSpacesPanel
            dot={dot}
            spaces={spaces}
            onRefreshSpaces={onRefreshSpaces}
            onAskDotToReview={handleAskDotToReview}
          />
        )}

        {activeTab === "settings" && (
          <div className="h-full overflow-y-auto p-6 max-w-2xl mx-auto space-y-6">
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Dot Configuration
              </h3>
              <p className="text-xs text-zinc-500">
                Adjust instructions, assigned tools, and working directory for {dot.name}.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                  System Persona & Instructions
                </label>
                <textarea
                  rows={4}
                  value={dot.systemPrompt}
                  onChange={(e) => onUpdateDot({ systemPrompt: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-900 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                  Virtual Working Directory
                </label>
                <input
                  type="text"
                  value={dot.workingDirectory}
                  onChange={(e) => onUpdateDot({ workingDirectory: e.target.value })}
                  className="w-full h-9 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs text-zinc-900 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                  Assigned Tools
                </label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {dot.tools.map((t) => (
                    <span
                      key={t}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-mono text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Danger Zone: Permanent Deletion */}
              {onDeleteDot && (
                <div className="pt-6 border-t border-red-200/80 dark:border-red-950/60">
                  <div className="rounded-2xl border border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-red-900 dark:text-red-200 flex items-center gap-1.5">
                        <Trash2 className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        Danger Zone: Remove AI Coworker
                      </h4>
                      <p className="text-[11px] text-red-700/80 dark:text-red-300/80 mt-1 leading-relaxed">
                        Permanently delete &ldquo;{dot.name}&rdquo; along with all conversation transcripts, autonomous tasks, and knowledge spaces.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteDot(dot.id)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer shrink-0 self-start sm:self-auto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete {dot.name}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
