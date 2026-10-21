"use client";

/**
 * Settings page for phryvos-k9.
 * Modular Settings Hub with dedicated single-section viewer.
 *
 * Importers/callers: Next.js App Router (/settings).
 * User instruction: "settings me har chij ke liye alag option rakho jispe click karne pe direct us chij ke page open ho jaye aur usme sirf usi chij ka section ho , ese thoda neat and clean lagega"
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Settings2,
  ArrowLeft,
  Search,
  Palette,
  KeyRound,
  ShieldCheck,
  Cpu,
  Brain,
  Sparkles,
  Database,
  Terminal,
  SearchCode,
  Share2,
  Send,
  Radio,
  MonitorSmartphone,
  FolderSync,
  Wrench,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

import { ProvidersPanel } from "@/components/settings/ProvidersPanel";
import { SystemPromptPanel } from "@/components/settings/SystemPromptPanel";
import { BackupPanel } from "@/components/settings/BackupPanel";
import { ChangePasswordPanel } from "@/components/settings/ChangePasswordPanel";
import { ThemePanel } from "@/components/settings/ThemePanel";
import { MemoryPanel } from "@/components/settings/MemoryPanel";
import { SyncPanel } from "@/components/settings/SyncPanel";
import { McpPanel } from "@/components/settings/McpPanel";
import { AIPexBridgePanel } from "@/components/settings/AIPexBridgePanel";
import { TelegramGatewayPanel } from "@/components/settings/TelegramGatewayPanel";
import { AgentReachPanel } from "@/components/settings/AgentReachPanel";
import { FreeModelsPanel } from "@/components/settings/FreeModelsPanel";
import { PluginManagerPanel } from "@/components/settings/PluginManagerPanel";
import { DigUpPanel } from "@/components/settings/DigUpPanel";
import { IFixAiPanel } from "@/components/settings/IFixAiPanel";
import { EccRulesPanel } from "@/components/settings/EccRulesPanel";
import { HermesSynthesisPanel } from "@/components/settings/HermesSynthesisPanel";

export type SettingSectionId =
  | "theme"
  | "password"
  | "backup"
  | "providers"
  | "system-prompt"
  | "memory"
  | "free-models"
  | "hermes"
  | "ecc-rules"
  | "ifixai"
  | "plugins"
  | "digup"
  | "mcp"
  | "telegram"
  | "agent-reach"
  | "aipex"
  | "sync";

interface SettingItem {
  id: SettingSectionId;
  title: string;
  category: "appearance-security" | "ai-intelligence" | "rules-devtools" | "channels-connectivity";
  description: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  component: React.ComponentType;
}

const SETTINGS_REGISTRY: SettingItem[] = [
  // 1. Appearance & Security
  {
    id: "theme",
    title: "Dual Theme & Appearance",
    category: "appearance-security",
    description: "Switch between clean dark and crisp light themes with auto-detect.",
    badge: "System UI",
    icon: Palette,
    iconColor: "text-purple-500 bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
    component: ThemePanel,
  },
  {
    id: "password",
    title: "Master Vault Password",
    category: "appearance-security",
    description: "Change SQLCipher master encryption passphrase protecting all agent memories and secrets.",
    badge: "SQLCipher",
    icon: KeyRound,
    iconColor: "text-amber-500 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
    component: ChangePasswordPanel,
  },
  {
    id: "backup",
    title: "Vault Backups & Restore",
    category: "appearance-security",
    description: "Export encrypted database archives or restore complete state on Android Termux.",
    badge: "Data Safe",
    icon: ShieldCheck,
    iconColor: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
    component: BackupPanel,
  },

  // 2. AI & Intelligence
  {
    id: "providers",
    title: "AI Providers & API Keys",
    category: "ai-intelligence",
    description: "Configure OpenAI, Anthropic, Gemini, DeepSeek, Groq, Ollama, and OpenClaw gateways.",
    badge: "Multi-LLM",
    icon: Cpu,
    iconColor: "text-blue-500 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
    component: ProvidersPanel,
  },
  {
    id: "free-models",
    title: "DSH Free AI Models Aggregator",
    category: "ai-intelligence",
    description: "Zero-cost high-performance LLM endpoints and rate-limit fallbacks from Ebony-Vinyl DSH.",
    badge: "Free AI",
    icon: Sparkles,
    iconColor: "text-cyan-500 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800",
    component: FreeModelsPanel,
  },
  {
    id: "hermes",
    title: "Hermes Agent Synthesis & Reflections",
    category: "ai-intelligence",
    description: "Autonomous post-session self-reflection, skill synthesis, and Hermes-3 agent reasoning loops.",
    badge: "NousResearch",
    icon: Brain,
    iconColor: "text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800",
    component: HermesSynthesisPanel,
  },
  {
    id: "system-prompt",
    title: "Global System Prompt & Directives",
    category: "ai-intelligence",
    description: "Base system instructions and core persona injected into all LLM conversations.",
    badge: "Prompting",
    icon: Terminal,
    iconColor: "text-zinc-600 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700",
    component: SystemPromptPanel,
  },
  {
    id: "memory",
    title: "Permanent Memory Facts",
    category: "ai-intelligence",
    description: "Browse, edit, and curate persistent memories retrieved across all chats and autonomous agents.",
    badge: "Knowledge",
    icon: Database,
    iconColor: "text-violet-500 bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800",
    component: MemoryPanel,
  },

  // 3. DevTools & Rules
  {
    id: "ecc-rules",
    title: "ECC Agent Coding Rules",
    category: "rules-devtools",
    description: "Enforce Cursor, Claude, and Copilot best practice rule sets across all generated code.",
    badge: "ECC Specs",
    icon: ShieldCheck,
    iconColor: "text-orange-500 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800",
    component: EccRulesPanel,
  },
  {
    id: "ifixai",
    title: "IFixAi Automated Code Healer",
    category: "rules-devtools",
    description: "Real-time codebase AST auditing, vulnerability scanning, and autonomous git patch generator.",
    badge: "Self-Heal",
    icon: Wrench,
    iconColor: "text-rose-500 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800",
    component: IFixAiPanel,
  },
  {
    id: "digup",
    title: "DigUp Deep Multi-Engine Search",
    category: "rules-devtools",
    description: "Aggregated web search engine querying Brave, DuckDuckGo, Tavily, and Google Serper.",
    badge: "Deep Search",
    icon: SearchCode,
    iconColor: "text-teal-500 bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800",
    component: DigUpPanel,
  },
  {
    id: "mcp",
    title: "Model Context Protocol (MCP)",
    category: "rules-devtools",
    description: "Connect external MCP tool servers, sqlite databases, filesystem, and API tools.",
    badge: "MCP Tools",
    icon: Wrench,
    iconColor: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
    component: McpPanel,
  },
  {
    id: "plugins",
    title: "Goose Extensions & Plugins",
    category: "rules-devtools",
    description: "AAIF Goose automation plugins, shell runners, and custom extension toolkits.",
    badge: "Goose Ext",
    icon: Terminal,
    iconColor: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
    component: PluginManagerPanel,
  },

  // 4. Connectivity & Channels
  {
    id: "telegram",
    title: "Telegram Bot Gateway",
    category: "channels-connectivity",
    description: "Bidirectional Telegram bot bridge with voice notes, file transfer, and admin whitelisting.",
    badge: "OpenClaw",
    icon: Send,
    iconColor: "text-sky-500 bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800",
    component: TelegramGatewayPanel,
  },
  {
    id: "agent-reach",
    title: "Agent-Reach Social Channels",
    category: "channels-connectivity",
    description: "Multi-platform reach for Discord, Twitter/X, GitHub issues, and Slack webhooks.",
    badge: "Social Bot",
    icon: Radio,
    iconColor: "text-pink-500 bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-800",
    component: AgentReachPanel,
  },
  {
    id: "aipex",
    title: "AIPex Desktop & Screen Bridge",
    category: "channels-connectivity",
    description: "Remote desktop vision, OS-level screen capture, and accessibility click-and-type automation.",
    badge: "Computer Use",
    icon: MonitorSmartphone,
    iconColor: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800",
    component: AIPexBridgePanel,
  },
  {
    id: "sync",
    title: "P2P Peer Sync & Mesh",
    category: "channels-connectivity",
    description: "Sync encrypted chats and memories directly with other local Android/Linux Phryvos nodes.",
    badge: "Mesh P2P",
    icon: FolderSync,
    iconColor: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
    component: SyncPanel,
  },
];

const CATEGORIES = [
  { id: "appearance-security", label: "Appearance & Security", count: 3 },
  { id: "ai-intelligence", label: "AI Models & Intelligence", count: 5 },
  { id: "rules-devtools", label: "Developer & Agent Rules", count: 5 },
  { id: "channels-connectivity", label: "Channels & Connectivity", count: 4 },
] as const;

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingSectionId | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Sync hash on mount and when changed
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash && SETTINGS_REGISTRY.some((s) => s.id === hash)) {
        setActiveSection(hash as SettingSectionId);
      } else if (!hash) {
        setActiveSection(null);
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const selectSection = (id: SettingSectionId | null) => {
    setActiveSection(id);
    if (id) {
      window.location.hash = id;
    } else {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return SETTINGS_REGISTRY;
    const q = searchQuery.toLowerCase();
    return SETTINGS_REGISTRY.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.badge?.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const activeItem = SETTINGS_REGISTRY.find((item) => item.id === activeSection);
  const ActiveComponent = activeItem?.component;

  return (
    <div className="h-full overflow-y-auto bg-zinc-50/70 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {activeItem && ActiveComponent ? (
        /* Single Section Dedicated View */
        <div className="mx-auto max-w-4xl p-3 sm:p-6 pb-20 space-y-6">
          {/* Breadcrumb & Navigation Bar */}
          <div className="sticky top-0 z-20 -mx-3 sm:-mx-6 px-3 sm:px-6 py-3 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                onClick={() => selectSection(null)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition active:scale-95 cursor-pointer shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Settings Hub</span>
              </button>

              <div className="flex items-center gap-1.5 min-w-0 text-xs text-zinc-400">
                <span className="hidden sm:inline">/</span>
                <span className="truncate font-semibold text-zinc-800 dark:text-zinc-200">
                  {activeItem.title}
                </span>
                {activeItem.badge && (
                  <span className="hidden sm:inline-flex rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                    {activeItem.badge}
                  </span>
                )}
              </div>
            </div>

            {/* Quick Section Switcher */}
            <select
              value={activeItem.id}
              onChange={(e) => selectSection(e.target.value as SettingSectionId)}
              className="h-8 max-w-[150px] sm:max-w-[200px] truncate rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none cursor-pointer"
            >
              {SETTINGS_REGISTRY.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>

          {/* Render ONLY the selected panel */}
          <div className="animate-in fade-in-50 duration-150">
            <ActiveComponent />
          </div>

          {/* Bottom Back Button */}
          <div className="pt-4 border-t border-zinc-200/80 dark:border-zinc-800 flex justify-between items-center">
            <button
              onClick={() => selectSection(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Settings Hub</span>
            </button>
            <span className="text-[11px] text-zinc-400">
              Phryvos-K9 • All 16 AI Agent Repos Integrated
            </span>
          </div>
        </div>
      ) : (
        /* Settings Hub / Modular Dashboard View */
        <div className="mx-auto max-w-4xl p-4 sm:p-6 pb-20 space-y-6">
          {/* Header */}
          <div className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5">
                  <span className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                    <Settings2 className="h-5 w-5" />
                  </span>
                  Settings & Configurations
                </h1>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  Choose a module below to open its dedicated configuration panel.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64 shrink-0">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search settings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 rounded-xl border border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-800 pl-8 pr-3 text-xs placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Grouped Categories */}
          {CATEGORIES.map((cat) => {
            const items = filteredItems.filter((i) => i.category === cat.id);
            if (items.length === 0) return null;

            return (
              <div key={cat.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {cat.label}
                  </h2>
                  <span className="text-[11px] font-medium text-zinc-400">
                    {items.length} {items.length === 1 ? "module" : "modules"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => selectSection(item.id)}
                        className="group relative flex items-start gap-3.5 p-4 text-left rounded-2xl border border-zinc-200/90 bg-white dark:border-zinc-800 dark:bg-zinc-900/90 hover:border-indigo-400/60 dark:hover:border-indigo-600/60 hover:shadow-md transition-all duration-150 active:scale-[0.99] cursor-pointer"
                      >
                        <div
                          className={`p-2.5 rounded-xl border shrink-0 transition-transform group-hover:scale-105 ${item.iconColor}`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {item.title}
                            </span>
                            {item.badge && (
                              <span className="hidden sm:inline-flex rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.2 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 border border-zinc-200/70 dark:border-zinc-700">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        </div>

                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-300 dark:text-zinc-600 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all">
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="p-8 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-500 text-xs">
              No configuration sections match &quot;{searchQuery}&quot;. Clear the search query to see all options.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
