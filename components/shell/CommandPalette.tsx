/**
 * Global Command Palette (Spotlight Modal) for phryvos-k9.
 * Fast keyboard-first search, route jumping, file navigation, and quick action dispatch.
 *
 * Importers/callers: components/shell/AppShell.tsx
 * Affected API: /api/files/search, client router navigation
 * Data schemas if any: None
 * User instruction verbatim: "1. Command Palette (Ctrl+K / Cmd+K) - Global spotlight interface for fast jumping"
 */
"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  MessageSquare,
  Folder,
  ListChecks,
  SquareKanban,
  GraduationCap,
  Target,
  CalendarDays,
  Settings2,
  Lock,
  SunMoon,
  FileText,
  Volume2,
  VolumeX,
  Sparkles,
  ArrowRight,
  PlusCircle,
  Keyboard,
  Bot,
  GitBranch,
  Palette,
} from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import { cyberAudio } from "@/lib/audio/cyberdeck-audio";

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  section: "Navigate" | "Quick Actions" | "Vault Files";
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [fileHits, setFileHits] = useState<Array<{ name: string; path: string }>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [audioEnabled, setAudioEnabled] = useState(cyberAudio.isEnabled());

  // Reset query and focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setFileHits([]);
      setTimeout(() => inputRef.current?.focus(), 50);
      cyberAudio.playNotification();
    }
  }, [open]);

  // Search vault files when query starts with letters or path
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setFileHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/files/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.hits)) {
            setFileHits(
              data.hits.slice(0, 5).map((h: { name: string; path: string }) => ({
                name: h.name,
                path: h.path,
              })),
            );
          }
        }
      } catch {}
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const items = useMemo<CommandItem[]>(() => {
    const baseNav: CommandItem[] = [
      {
        id: "nav-chat",
        title: "Chat & AI Co-Pilot",
        subtitle: "Multi-model reasoning, tools, and sessions",
        icon: MessageSquare,
        section: "Navigate",
        shortcut: "G C",
        action: () => router.push("/chat"),
      },
      {
        id: "nav-vault",
        title: "Vault Files & Editor",
        subtitle: "Encrypted virtual filesystem and Monaco editor",
        icon: Folder,
        section: "Navigate",
        shortcut: "G V",
        action: () => router.push("/vault"),
      },
      {
        id: "nav-tasks",
        title: "Tasks & Schedule",
        subtitle: "Daily todo list, recurring tasks, and rollover",
        icon: ListChecks,
        section: "Navigate",
        shortcut: "G T",
        action: () => router.push("/tasks"),
      },
      {
        id: "nav-exams",
        title: "Exams & Study Prep",
        subtitle: "Syllabus tracker, study logs, and mock tests",
        icon: GraduationCap,
        section: "Navigate",
        shortcut: "G E",
        action: () => router.push("/exams"),
      },
      {
        id: "nav-projects",
        title: "Projects & Kanban",
        subtitle: "Board view and milestone tracking",
        icon: SquareKanban,
        section: "Navigate",
        shortcut: "G P",
        action: () => router.push("/projects"),
      },
      {
        id: "nav-goals",
        title: "Goals & Milestones",
        subtitle: "Target tracking and auto-computed progress",
        icon: Target,
        section: "Navigate",
        shortcut: "G G",
        action: () => router.push("/goals"),
      },
      {
        id: "nav-calendar",
        title: "Calendar & Deadlines",
        subtitle: "Schedule planner and event timeline",
        icon: CalendarDays,
        section: "Navigate",
        shortcut: "G L",
        action: () => router.push("/calendar"),
      },
      {
        id: "nav-settings",
        title: "Settings & Backups",
        subtitle: "AI providers, security, and export",
        icon: Settings2,
        section: "Navigate",
        shortcut: "G S",
        action: () => router.push("/settings"),
      },
      {
        id: "nav-dots",
        title: "Dots & Coworkers",
        subtitle: "Specialist AI agents with dedicated workspaces",
        icon: Bot,
        section: "Navigate",
        shortcut: "G D",
        action: () => router.push("/dots"),
      },
      {
        id: "nav-workflows",
        title: "Workflows & Recipes",
        subtitle: "Automated multi-step Goose execution pipelines",
        icon: GitBranch,
        section: "Navigate",
        shortcut: "G W",
        action: () => router.push("/workflows"),
      },
      {
        id: "nav-design-system",
        title: "Design System",
        subtitle: "Component library, tokens, and visual consistency",
        icon: Palette,
        section: "Navigate",
        shortcut: "G I",
        action: () => router.push("/design-system"),
      },
    ];

    const actions: CommandItem[] = [
      {
        id: "act-scratchpad",
        title: "Open Daily Scratchpad",
        subtitle: "Today's quick study notes in vault",
        icon: FileText,
        section: "Quick Actions",
        shortcut: "Ctrl+D",
        action: () => {
          const today = new Date().toISOString().slice(0, 10);
          router.push(`/vault?scratchpad=${today}`);
        },
      },
      {
        id: "act-lock",
        title: "Lock Vault Now",
        subtitle: "Zero-out master key from memory",
        icon: Lock,
        section: "Quick Actions",
        shortcut: "Ctrl+Shift+L",
        action: async () => {
          cyberAudio.playVaultLock();
          await fetch("/api/auth/lock", { method: "POST" });
          router.replace("/unlock");
        },
      },
      {
        id: "act-theme",
        title: `Toggle Theme (Current: ${resolvedTheme ?? "dark"})`,
        subtitle: "Switch between dark and light aesthetics",
        icon: SunMoon,
        section: "Quick Actions",
        action: () => {
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
        },
      },
      {
        id: "act-audio",
        title: `Toggle Cyber-Deck Audio (Current: ${audioEnabled ? "On" : "Muted"})`,
        subtitle: "Native Web Audio procedural soundscape",
        icon: audioEnabled ? Volume2 : VolumeX,
        section: "Quick Actions",
        action: () => {
          const next = cyberAudio.toggle();
          setAudioEnabled(next);
        },
      },
      {
        id: "act-new-task",
        title: "Create New Task",
        subtitle: "Add to daily task inbox",
        icon: PlusCircle,
        section: "Quick Actions",
        action: () => router.push("/tasks?create=true"),
      },
      {
        id: "act-shortcuts",
        title: "Keyboard Shortcuts Reference",
        subtitle: "View complete keyboard cheat sheet",
        icon: Keyboard,
        section: "Quick Actions",
        shortcut: "?",
        action: () => {
          onClose();
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("phryvos:shortcuts"));
          }, 100);
        },
      },
      {
        id: "act-new-dot",
        title: "Create New Dot",
        subtitle: "Spin up a specialist AI coworker",
        icon: PlusCircle,
        section: "Quick Actions",
        action: () => router.push("/dots?create=true"),
      },
      {
        id: "act-new-workflow",
        title: "Create New Workflow",
        subtitle: "Design a Goose automation recipe",
        icon: PlusCircle,
        section: "Quick Actions",
        action: () => router.push("/workflows?create=true"),
      },
      {
        id: "act-new-component",
        title: "Create Design System Component",
        subtitle: "Add a new component to the library",
        icon: PlusCircle,
        section: "Quick Actions",
        action: () => router.push("/design-system?create=true"),
      },
    ];

    const fileItems: CommandItem[] = fileHits.map((h) => ({
      id: `file-${h.path}`,
      title: h.name,
      subtitle: h.path,
      icon: FileText,
      section: "Vault Files",
      action: () => router.push(`/vault?open=${encodeURIComponent(h.path)}`),
    }));

    const all = [...fileItems, ...actions, ...baseNav];
    const q = query.toLowerCase().trim();
    if (!q) return all;

    return all.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)),
    );
  }, [query, fileHits, resolvedTheme, setTheme, audioEnabled, router]);

  // Adjust selected index on items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, items.length));
        cyberAudio.playKeyClick();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + items.length) % Math.max(1, items.length));
        cyberAudio.playKeyClick();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selected = items[selectedIndex];
        if (selected) {
          cyberAudio.playTaskComplete();
          onClose();
          selected.action();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, items, selectedIndex, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-zinc-950/70 backdrop-blur-sm transition-opacity"
      />

      {/* Palette Container */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/95 ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3.5 dark:border-zinc-800">
          <Search className="h-4 w-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, files, or jump to route..."
            className="w-full bg-transparent text-sm font-medium text-zinc-900 placeholder-zinc-400 focus:outline-none dark:text-zinc-100 dark:placeholder-zinc-500"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-400">
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    cyberAudio.playTaskComplete();
                    onClose();
                    item.action();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-850 dark:text-zinc-50 font-medium"
                      : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-colors ${
                        isSelected
                          ? "bg-zinc-900 text-white dark:bg-zinc-700 dark:text-zinc-100"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{item.title}</span>
                        <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-normal">
                          {item.section}
                        </span>
                      </div>
                      {item.subtitle && (
                        <div className="truncate text-xs text-zinc-400 dark:text-zinc-500 font-normal">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {item.shortcut && (
                      <kbd className="hidden sm:inline-block rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
                        {item.shortcut}
                      </kbd>
                    )}
                    {isSelected && (
                      <ArrowRight className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/80 px-4 py-2 text-[11px] text-zinc-400 dark:border-zinc-850 dark:bg-zinc-900/60 dark:text-zinc-500">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-emerald-500" />
            <span>Phryvos-k9 Spotlight</span>
          </div>
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </div>
        </div>
      </div>
    </div>
  );
}
