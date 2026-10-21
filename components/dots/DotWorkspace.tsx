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
  ArrowLeft,
  Clock,
  ScrollText,
} from "lucide-react";
import { DotMascot } from "./DotMascot";
import { DotComputerPanel } from "./DotComputerPanel";
import { DotSpacesPanel } from "./DotSpacesPanel";
import { DotTasksPanel } from "./DotTasksPanel";
import { RecipesPanel } from "./RecipesPanel";
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
  onUpdateDot: (updates: Partial<DotDto>) => void;
  providers: ProviderMeta[];
  providerId: number | "";
  selectedModel: string;
  onSelectProvider: (id: number | "") => void;
  onSelectModel: (m: string) => void;
}

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
  onUpdateDot,
  providers,
  providerId,
  selectedModel,
  onSelectProvider,
  onSelectModel,
}: DotWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "tasks" | "recipes" | "computer" | "spaces" | "settings">("chat");
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
    onSendMessage(`Please review this document titled "${docTitle}":\n\n\`\`\`markdown\n${docContent}\n\`\`\`\n\nProvide constructive feedback, identify potential gaps, and suggest concrete enhancements.`);
  };

  const currentProv = providers.find((p) => p.id === providerId) ?? providers[0];
  const modelOptions = currentProv?.models ?? [];

  return (
    <div className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Unified Single Top Bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800 px-2 sm:px-3 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-sm gap-1.5 sm:gap-2">
        {/* Left: Navigation controls + Dot Identity */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
          {/* Mobile Main Menu trigger */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("phryvos:open-menu"))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-zinc-100 active:scale-95 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 md:hidden shrink-0 cursor-pointer"
            title="Open Main Navigation Menu"
            aria-label="Open Navigation Menu"
          >
            <Menu className="h-4 w-4" />
          </button>

          {/* Mobile Coworkers trigger */}
          <button
            onClick={onToggleRoster}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-zinc-100 active:scale-95 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 md:hidden shrink-0 cursor-pointer"
            title="Toggle Coworkers Roster"
            aria-label="Toggle Coworkers"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          {/* Desktop Coworkers toggle button */}
          <button
            onClick={onToggleDesktopRoster}
            className="hidden md:flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 transition shrink-0 cursor-pointer"
            title="Toggle Coworkers sidebar"
          >
            <PanelLeft className="h-4 w-4" />
            <span className="hidden lg:inline">{desktopRosterOpen ? "Hide" : "Coworkers"}</span>
          </button>

          {/* Dot Mascot & Identity */}
          <div className="flex items-center gap-1.5 min-w-0">
            <DotMascot character={dot.character} size="small" state={dot.status} className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
            <div className="min-w-0 hidden xs:block">
              <div className="flex items-center gap-1">
                <span className="truncate text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {dot.name}
                </span>
                <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.2 text-[9px] font-semibold text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-300 capitalize">
                  {dot.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Integrated Workspace Tabs (Chat, Tasks, Computer, Spaces, Settings) */}
        <div className="flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-zinc-100/80 p-0.5 dark:border-zinc-800 dark:bg-zinc-900 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1 text-xs font-medium transition cursor-pointer shrink-0 ${
              activeTab === "chat"
                ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Chat conversation"
          >
            <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
            <span>Chat</span>
          </button>

          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1 text-xs font-medium transition cursor-pointer shrink-0 ${
              activeTab === "tasks"
                ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Autonomous Scheduled Tasks"
          >
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span>Tasks</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </button>

          <button
            onClick={() => setActiveTab("computer")}
            className={`flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1 text-xs font-medium transition cursor-pointer shrink-0 ${
              activeTab === "computer"
                ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Termux Computer / Shell / Tools"
          >
            <Monitor className="h-3.5 w-3.5 text-blue-500" />
            <span className="hidden sm:inline">Computer</span>
          </button>

          <button
            onClick={() => setActiveTab("spaces")}
            className={`flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1 text-xs font-medium transition cursor-pointer shrink-0 ${
              activeTab === "spaces"
                ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Document Spaces"
          >
            <BookOpen className="h-3.5 w-3.5 text-purple-500" />
            <span className="hidden sm:inline">Spaces</span>
            {spaces.length > 0 && (
              <span className="rounded-full bg-zinc-200/80 px-1 text-[9px] font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                {spaces.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("recipes")}
            className={`flex items-center gap-1 rounded-lg px-2 sm:px-2.5 py-1 text-xs font-medium transition cursor-pointer shrink-0 ${
              activeTab === "recipes"
                ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Goose Automation Recipes"
          >
            <ScrollText className="h-3.5 w-3.5 text-amber-500" />
            <span className="hidden sm:inline">Recipes</span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`flex items-center gap-1 rounded-lg px-1.5 sm:px-2 py-1 text-xs font-medium transition cursor-pointer shrink-0 ${
              activeTab === "settings"
                ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Dot Instructions & Personality Settings"
          >
            <Settings2 className="h-3.5 w-3.5 text-zinc-500" />
            <span className="hidden md:inline">Settings</span>
          </button>
        </div>

        {/* Right: Model Selector & Call Button */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 min-w-0">
          {/* Provider selector if multiple */}
          {providers.length > 1 && (
            <select
              value={String(providerId)}
              onChange={(e) => onSelectProvider(e.target.value === "" ? "" : Number(e.target.value))}
              className="h-8 max-w-[80px] sm:max-w-[105px] truncate rounded-lg border border-zinc-200 bg-zinc-50 px-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none cursor-pointer hidden md:block"
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
              className="h-8 max-w-[85px] xs:max-w-[110px] sm:max-w-[145px] truncate rounded-lg border border-zinc-200 bg-zinc-50 px-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none cursor-pointer"
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
            <span className="hidden lg:inline">Call</span>
          </button>
        </div>
      </div>

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
                      onClick={() => onSendMessage("Give me a brief breakdown of your capabilities and how we can work together.")}
                      className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition cursor-pointer"
                    >
                      💡 Explore capabilities
                    </button>
                    <button
                      onClick={() => onSendMessage("Inspect your current virtual working directory and show me your environment status.")}
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

        {activeTab === "tasks" && <DotTasksPanel dot={dot} onRefreshMessages={onRefreshSpaces} />}

        {activeTab === "recipes" && <RecipesPanel dot={dot} />}

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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}