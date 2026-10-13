/**
 * AppShell responsive layout with collapsible mobile drawer,
 * permanent desktop sidebar, lock watchdog, and dual theme support.
 *
 * Importers/callers: app/(app)/layout.tsx
 * Affected API: /api/auth/lock
 * Data schemas if any: None
 * User instruction verbatim: "1. i want dual theme dark and light"
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  Folder,
  GraduationCap,
  ListChecks,
  Lock,
  MessageSquare,
  Settings2,
  SquareKanban,
  Target,
  Menu,
  X,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare, description: "AI Agent & Data" },
  { href: "/vault", label: "Files", icon: Folder, description: "Encrypted Storage" },
  { href: "/tasks", label: "Tasks", icon: ListChecks, description: "Daily & Recurring" },
  { href: "/projects", label: "Projects", icon: SquareKanban, description: "Kanban & Gantt" },
  { href: "/exams", label: "Exams", icon: GraduationCap, description: "Prep & Study Logs" },
  { href: "/goals", label: "Goals", icon: Target, description: "Milestones & Progress" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, description: "Schedule & Events" },
  { href: "/settings", label: "Settings", icon: Settings2, description: "AI & Vault Config" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [locking, setLocking] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock vault action
  async function lock() {
    setLocking(true);
    try {
      await fetch("/api/auth/lock", { method: "POST" });
      router.replace("/unlock");
    } finally {
      setLocking(false);
    }
  }

  const currentNav = NAV.find((n) => pathname.startsWith(n.href)) ?? NAV[0];

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Mobile Top Header */}
      <header className="fixed top-0 inset-x-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/95 px-4 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-zinc-100 active:scale-95 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-900">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm tracking-tight">
            phryvos k9
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{currentNav.label}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <button
            onClick={lock}
            disabled={locking}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            title="Lock Vault"
            aria-label="Lock Vault"
          >
            <Lock className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-xs transition-opacity md:hidden"
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer (Slide-over) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[82vw] flex-col border-r border-zinc-200 bg-white shadow-2xl transition-transform duration-300 ease-out dark:border-zinc-800 dark:bg-zinc-950 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-zinc-100 px-4 dark:border-zinc-850">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900">
              <Sparkles className="h-4 w-4 text-emerald-400 dark:text-emerald-600" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                phryvos k9
              </div>
              <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Encrypted Vault
              </div>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile Navigation List */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {NAV.map(({ href, label, icon: Icon, description }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  active
                    ? "bg-zinc-900 font-medium text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                    active
                      ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="leading-tight font-medium">{label}</div>
                  <div
                    className={`text-[11px] truncate ${
                      active ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    {description}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Mobile Drawer Footer */}
        <div className="border-t border-zinc-200 p-3 space-y-2 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex items-center justify-between px-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>AES-256-GCM</span>
            </div>
            <ThemeToggle />
          </div>
          <button
            onClick={lock}
            disabled={locking}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 shadow-2xs transition hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-red-950/30 dark:hover:border-red-800 dark:hover:text-red-400"
          >
            <Lock className="h-4 w-4" />
            Lock vault now
          </button>
        </div>
      </aside>

      {/* Desktop Permanent Sidebar */}
      <aside className="hidden md:flex h-full w-60 shrink-0 flex-col border-r border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-100 dark:border-zinc-850">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm ring-1 ring-black/5 dark:bg-zinc-100 dark:text-zinc-900">
              <Sparkles className="h-4.5 w-4.5 text-emerald-400 dark:text-emerald-600" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                phryvos k9
              </div>
              <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                personal vault
              </div>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Desktop Navigation Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {NAV.map(({ href, label, icon: Icon, description }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all ${
                  active
                    ? "bg-zinc-900 font-medium text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    active
                      ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200 group-hover:text-zinc-900 dark:bg-zinc-900 dark:text-zinc-500 dark:group-hover:bg-zinc-800 dark:group-hover:text-zinc-200"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="leading-tight">{label}</div>
                  <div
                    className={`text-[10px] truncate ${
                      active ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    {description}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Desktop Footer with Security Badge & Lock Button */}
        <div className="border-t border-zinc-200 p-3 space-y-2 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex items-center gap-1.5 px-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Encrypted local session</span>
          </div>
          <button
            onClick={lock}
            disabled={locking}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-2xs transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <Lock className="h-3.5 w-3.5" />
            Lock vault
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden pt-14 md:pt-0 bg-white dark:bg-zinc-950">
        {children}
      </main>
    </div>
  );
}
