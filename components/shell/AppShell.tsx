"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare,
  Folder,
  Workflow,
  Bot,
  ListChecks,
  SquareKanban,
  GraduationCap,
  Target,
  CalendarDays,
  Settings2,
  Lock,
  Sparkles,
  Search,
  Shield,
  Menu,
  X,
} from "lucide-react";
import { useUiStore } from "@/stores/ui-store";
import { authApi } from "@/lib/api/client";
import { keyring } from "@/lib/keyring";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { FloatingAssistant } from "@/components/shell/FloatingAssistant";

const NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: MessageSquare, shortcut: "1" },
  { href: "/vault", label: "Files", icon: Folder, shortcut: "2" },
  { href: "/workflows", label: "Flows", icon: Workflow, shortcut: "3" },
  { href: "/dots", label: "Dots", icon: Bot, shortcut: "4" },
  { href: "/tasks", label: "Tasks", icon: ListChecks, shortcut: "5" },
  { href: "/projects", label: "Projects", icon: SquareKanban, shortcut: "6" },
  { href: "/exams", label: "Exams", icon: GraduationCap, shortcut: "7" },
  { href: "/goals", label: "Goals", icon: Target, shortcut: "8" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, shortcut: "9" },
  { href: "/settings", label: "Settings", icon: Settings2, shortcut: "," },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const {
    aiDockOpen,
    toggleAiDock,
    setAiDockOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    isTabBlurred,
    setIsTabBlurred,
  } = useUiStore();

  const [locking, setLocking] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  // ---------------------------------------------------------------- Lock Vault
  const handleLock = React.useCallback(async () => {
    if (locking) return;
    setLocking(true);
    try {
      await authApi.lock();
    } catch {
      // Force local wipe regardless of server response
    } finally {
      keyring.wipe();
      router.replace("/unlock");
    }
  }, [locking, router]);

  // ---------------------------------------------------------------- Idle Watchdog (5m) & Keyboard Shortcuts
  React.useEffect(() => {
    let idleTimer: NodeJS.Timeout;
    const IDLE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        handleLock();
      }, IDLE_LIMIT_MS);
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      resetIdleTimer();

      // ⌘K or Ctrl+K -> Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }

      // ⌘J or Ctrl+J -> AI Dock
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggleAiDock();
      }

      // ⌘Shift+L -> Immediate Lock
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        handleLock();
      }
    };

    window.addEventListener("mousemove", resetIdleTimer);
    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("scroll", resetIdleTimer, true);
    window.addEventListener("touchstart", resetIdleTimer);

    resetIdleTimer();

    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener("mousemove", resetIdleTimer);
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("scroll", resetIdleTimer, true);
      window.removeEventListener("touchstart", resetIdleTimer);
    };
  }, [commandPaletteOpen, setCommandPaletteOpen, toggleAiDock, handleLock]);

  // ---------------------------------------------------------------- Tab Hidden Blur (>30s)
  React.useEffect(() => {
    let blurTimeout: NodeJS.Timeout;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        blurTimeout = setTimeout(() => {
          setIsTabBlurred(true);
        }, 30000); // 30 seconds
      } else {
        clearTimeout(blurTimeout);
        setIsTabBlurred(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearTimeout(blurTimeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [setIsTabBlurred]);

  return (
    <div
      className={`h-screen w-screen overflow-hidden flex flex-col bg-[var(--bg-0)] text-[var(--fg-0)] select-none transition-filter duration-200 ${
        isTabBlurred ? "blur-[20px]" : ""
      }`}
    >
      {/* ── Main 3-Zone Workspace Shell ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 1. Left Icon Rail (56px fixed) — Desktop / Tablet */}
        <aside className="hidden md:flex flex-col items-center justify-between w-[56px] bg-[var(--bg-1)] border-r border-[var(--border-subtle)] py-3 z-30 shrink-0">
          {/* Top Glyph */}
          <div className="flex flex-col items-center gap-3">
            <Link
              href="/chat"
              className="h-8 w-8 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)] flex items-center justify-center hover:bg-[var(--accent)] hover:text-white transition-colors"
              title="Phryvos Vault"
            >
              <Shield className="h-4 w-4 stroke-[1.5]" />
            </Link>

            <div className="w-6 h-[1px] bg-[var(--border-subtle)] my-0.5" />

            {/* Navigation Icons */}
            <nav className="flex flex-col items-center gap-1">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    title={`${label} (⌘${label[0]})`}
                    className={`relative flex items-center justify-center h-10 w-10 rounded-[var(--radius-sm)] transition-colors ${
                      isActive
                        ? "bg-[var(--bg-3)] text-[var(--fg-0)]"
                        : "text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)]"
                    }`}
                  >
                    {/* Left 2px Active Bar */}
                    {isActive && (
                      <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-[var(--accent)] rounded-r-[3px]" />
                    )}
                    <Icon className="h-5 w-5 stroke-[1.5]" />
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Bottom Rail Actions */}
          <div className="flex flex-col items-center gap-2">
            {/* Quick Search (⌘K) */}
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center justify-center h-9 w-9 rounded-[var(--radius-sm)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] transition-colors"
              title="Command Palette (⌘K)"
            >
              <Search className="h-4 w-4 stroke-[1.5]" />
            </button>

            {/* Lock Button */}
            <button
              type="button"
              onClick={handleLock}
              disabled={locking}
              className="relative flex items-center justify-center h-9 w-9 rounded-[var(--radius-sm)] text-[var(--fg-2)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
              title="Lock Vault Now"
            >
              <Lock className="h-4 w-4 stroke-[1.5]" />
              <span
                className={`absolute top-1 right-1 h-2 w-2 rounded-full ${
                  locking ? "bg-amber-400 animate-ping" : "bg-emerald-500"
                }`}
              />
            </button>
          </div>
        </aside>

        {/* 2. Main Workspace (flex: 1) */}
        <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg-0)] overflow-hidden relative">
          {/* Mobile Menu Floating Trigger (Zero permanent top-bar clutter) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden fixed top-3 left-3 z-30 h-8 w-8 rounded-[var(--radius-sm)] bg-[var(--bg-1)]/90 backdrop-blur-md border border-[var(--border)] text-[var(--fg-1)] flex items-center justify-center shadow-xs hover:bg-[var(--bg-2)] active:scale-95 transition-all"
            title="Open Navigation Menu"
          >
            <Menu className="h-4 w-4 stroke-[1.5]" />
          </button>

          {/* Page Workspace Children */}
          <div className="flex-1 overflow-auto flex flex-col min-h-0">
            {children}
          </div>
        </main>

        {/* 3. Floating Global AI Assistant (Floatable Modal, ⌘J) */}
        <FloatingAssistant
          open={aiDockOpen}
          onClose={() => setAiDockOpen(false)}
        />

        {/* Floating Sparkles Trigger when AI Assistant is Closed */}
        {!aiDockOpen && (
          <button
            type="button"
            onClick={() => setAiDockOpen(true)}
            className="fixed bottom-6 right-6 h-11 w-11 rounded-full bg-[var(--bg-1)] border border-[var(--border)] text-[var(--accent)] shadow-[var(--shadow-dialog)] flex items-center justify-center hover:bg-[var(--bg-2)] hover:border-[var(--accent)] transition-all z-40 active:scale-95"
            title="Open Quick Assistant (⌘J)"
          >
            <Sparkles className="h-5 w-5 stroke-[1.5]" />
          </button>
        )}
      </div>

      {/* ── Global Command Palette (⌘K) ── */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      {/* ── Mobile Navigation Drawer ── */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60"
          />
          <div className="relative w-[280px] h-full bg-[var(--bg-1)] border-r border-[var(--border-subtle)] flex flex-col p-4 z-10">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)] mb-4">
              <span className="font-semibold text-[var(--fg-0)]">Phryvos Navigation</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-[var(--fg-2)] hover:text-[var(--fg-0)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] text-[var(--text-base)] ${
                    pathname.startsWith(href)
                      ? "bg-[var(--bg-3)] text-[var(--fg-0)] font-medium"
                      : "text-[var(--fg-2)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)]"
                  }`}
                >
                  <Icon className="h-4 w-4 stroke-[1.5]" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
            <div className="pt-4 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={handleLock}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-[var(--danger)] hover:bg-[var(--danger-soft)]"
              >
                <Lock className="h-4 w-4" />
                <span>Lock Vault</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
