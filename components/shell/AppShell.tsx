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
  PanelLeftClose,
  PanelLeftOpen,
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
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  // Restore sidebar collapse state from localStorage
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("phryvos_sidebar_collapsed");
      if (stored !== null) {
        setSidebarCollapsed(stored === "true");
      }
    } catch {}
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("phryvos_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  }, []);

  // Close mobile drawer on route change
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Listen for custom trigger events from pages (e.g. ChatApp / Dots mobile menu button)
  React.useEffect(() => {
    const handleOpenMenu = () => setMobileMenuOpen(true);
    const handleToggleSidebar = () => toggleSidebar();
    window.addEventListener("phryvos:open-menu", handleOpenMenu);
    window.addEventListener("phryvos:toggle-sidebar", handleToggleSidebar);
    return () => {
      window.removeEventListener("phryvos:open-menu", handleOpenMenu);
      window.removeEventListener("phryvos:toggle-sidebar", handleToggleSidebar);
    };
  }, [toggleSidebar]);

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

      // ⌘B or Ctrl+B -> Toggle Sidebar
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }

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

  const currentNav =
    NAV_ITEMS.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`)) ??
    NAV_ITEMS[0];
  const isFullView = pathname.startsWith("/chat") || pathname.startsWith("/dots");

  return (
    <div
      className={`h-screen w-screen overflow-hidden flex flex-col bg-[var(--bg-0)] text-[var(--fg-0)] select-none transition-filter duration-200 ${
        isTabBlurred ? "blur-[20px]" : ""
      }`}
    >
      {/* ── Main Workspace Shell ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 1. Left Navigation Sidebar (Collapsible / Sliding) — Desktop / Tablet */}
        <aside
          className={`hidden md:flex flex-col justify-between bg-[var(--bg-1)] border-r border-[var(--border-subtle)] py-3 z-30 shrink-0 relative transition-[width] duration-200 ease-in-out select-none ${
            sidebarCollapsed ? "w-14 items-center" : "w-56 px-3"
          }`}
        >
          {/* Top Brand & Header */}
          <div className="flex flex-col gap-2">
            <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between px-1"}`}>
              {sidebarCollapsed ? (
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="h-8 w-8 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)] flex items-center justify-center hover:bg-[var(--accent)] hover:text-white transition-colors cursor-pointer"
                  title="Expand Sidebar (⌘B)"
                >
                  <Shield className="h-4 w-4 stroke-[1.5]" />
                </button>
              ) : (
                <>
                  <Link
                    href="/chat"
                    className="flex items-center gap-2 text-[var(--fg-0)] hover:opacity-85 transition-opacity"
                    title="Phryvos Vault"
                  >
                    <div className="h-7 w-7 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)] flex items-center justify-center">
                      <Shield className="h-4 w-4 stroke-[1.5]" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs tracking-tight leading-none text-[var(--fg-0)]">
                        phryvos k9
                      </span>
                      <span className="text-[10px] text-[var(--fg-2)] leading-tight mt-0.5 font-medium">
                        encrypted vault
                      </span>
                    </div>
                  </Link>

                  <button
                    type="button"
                    onClick={toggleSidebar}
                    className="h-7 w-7 rounded-[var(--radius-xs)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] flex items-center justify-center transition-colors cursor-pointer"
                    title="Collapse Sidebar (⌘B)"
                  >
                    <PanelLeftClose className="h-4 w-4 stroke-[1.5]" />
                  </button>
                </>
              )}
            </div>

            <div className={`${sidebarCollapsed ? "w-6 mx-auto" : "w-full"} h-[1px] bg-[var(--border-subtle)] my-1`} />

            {/* Navigation Items */}
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map(({ href, label, icon: Icon, shortcut }) => {
                const isActive = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    title={`${label} (⌘${shortcut})`}
                    className={`relative flex items-center rounded-[var(--radius-sm)] transition-colors ${
                      sidebarCollapsed
                        ? "justify-center h-10 w-10 mx-auto"
                        : "h-9 px-2.5 gap-2.5 w-full text-xs"
                    } ${
                      isActive
                        ? "bg-[var(--bg-3)] text-[var(--fg-0)] font-medium"
                        : "text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)]"
                    }`}
                  >
                    {/* Active Bar indicator */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[var(--accent)] rounded-r-[3px]" />
                    )}
                    <Icon className="h-4 w-4 stroke-[1.5] shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="flex-1 truncate">{label}</span>
                    )}
                    {!sidebarCollapsed && (
                      <span className="text-[10px] text-[var(--fg-3)] font-mono">⌘{shortcut}</span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Bottom Actions */}
          <div className="flex flex-col gap-1.5">
            {sidebarCollapsed ? (
              <>
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(true)}
                  className="flex items-center justify-center h-9 w-9 rounded-[var(--radius-sm)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] transition-colors mx-auto cursor-pointer"
                  title="Command Palette (⌘K)"
                >
                  <Search className="h-4 w-4 stroke-[1.5]" />
                </button>
                <button
                  type="button"
                  onClick={handleLock}
                  disabled={locking}
                  className="relative flex items-center justify-center h-9 w-9 rounded-[var(--radius-sm)] text-[var(--fg-2)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors mx-auto cursor-pointer"
                  title="Lock Vault Now (⌘⇧L)"
                >
                  <Lock className="h-4 w-4 stroke-[1.5]" />
                  <span
                    className={`absolute top-1 right-1 h-2 w-2 rounded-full ${
                      locking ? "bg-amber-400 animate-ping" : "bg-emerald-500"
                    }`}
                  />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(true)}
                  className="flex items-center justify-between h-8 px-2.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-0)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:border-[var(--border)] transition-colors text-xs w-full cursor-pointer"
                  title="Command Palette (⌘K)"
                >
                  <span className="flex items-center gap-2">
                    <Search className="h-3.5 w-3.5" />
                    <span>Search vault</span>
                  </span>
                  <span className="font-mono text-[10px] text-[var(--fg-3)]">⌘K</span>
                </button>

                <button
                  type="button"
                  onClick={handleLock}
                  disabled={locking}
                  className="flex items-center justify-between h-8 px-2.5 rounded-[var(--radius-sm)] text-[var(--fg-2)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors text-xs w-full cursor-pointer"
                  title="Lock Vault Now (⌘⇧L)"
                >
                  <span className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5" />
                    <span>Lock Vault</span>
                  </span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      locking ? "bg-amber-400 animate-ping" : "bg-emerald-500"
                    }`}
                  />
                </button>
              </>
            )}
          </div>
        </aside>

        {/* 2. Main Workspace (flex: 1) */}
        <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg-0)] overflow-hidden relative">
          {/* Mobile Top Header (In-flow flex item: NEVER overlaps child content) */}
          {!isFullView && (
            <div className="md:hidden h-12 px-3 border-b border-[var(--border-subtle)] bg-[var(--bg-1)] flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="h-8 w-8 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-2)] text-[var(--fg-1)] flex items-center justify-center hover:bg-[var(--bg-3)] active:scale-95 transition-all shrink-0"
                  title="Open Navigation Menu"
                >
                  <Menu className="h-4 w-4 stroke-[1.5]" />
                </button>
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-semibold text-xs text-[var(--fg-0)]">phryvos</span>
                  <span className="text-[var(--border)]">/</span>
                  <span className="text-xs text-[var(--fg-2)] font-medium capitalize">
                    {currentNav?.label ?? "Vault"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(true)}
                  className="h-8 w-8 rounded-[var(--radius-sm)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] flex items-center justify-center"
                  title="Command Palette (⌘K)"
                >
                  <Search className="h-4 w-4 stroke-[1.5]" />
                </button>
                <button
                  type="button"
                  onClick={handleLock}
                  disabled={locking}
                  className="h-8 w-8 rounded-[var(--radius-sm)] text-[var(--fg-2)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] flex items-center justify-center"
                  title="Lock Vault"
                >
                  <Lock className="h-4 w-4 stroke-[1.5]" />
                </button>
              </div>
            </div>
          )}

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
            className="fixed bottom-6 right-6 h-11 w-11 rounded-full bg-[var(--bg-1)] border border-[var(--border)] text-[var(--accent)] shadow-[var(--shadow-dialog)] flex items-center justify-center hover:bg-[var(--bg-2)] hover:border-[var(--accent)] transition-all z-40 active:scale-95 cursor-pointer"
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
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
          />
          <div className="relative w-[280px] max-w-[85vw] h-full bg-[var(--bg-1)] border-r border-[var(--border-subtle)] flex flex-col p-4 z-10 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border-subtle)] mb-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)] flex items-center justify-center">
                  <Shield className="h-4 w-4 stroke-[1.5]" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-xs text-[var(--fg-0)]">phryvos k9</span>
                  <span className="text-[10px] text-[var(--fg-2)] font-medium">navigation</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-[var(--radius-xs)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] transition-colors cursor-pointer"
                title="Close Navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map(({ href, label, icon: Icon, shortcut }) => {
                const isActive = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-sm)] text-[var(--text-sm)] transition-colors ${
                      isActive
                        ? "bg-[var(--bg-3)] text-[var(--fg-0)] font-medium"
                        : "text-[var(--fg-2)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 stroke-[1.5]" />
                      <span>{label}</span>
                    </div>
                    <span className="text-[10px] text-[var(--fg-3)] font-mono">⌘{shortcut}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setCommandPaletteOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-0)] text-[var(--fg-2)] hover:text-[var(--fg-0)] text-xs transition-colors cursor-pointer"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search vault (⌘K)</span>
              </button>
              <button
                type="button"
                onClick={handleLock}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white transition-colors text-xs font-medium cursor-pointer"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Lock Vault Now</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
