/**
 * ThemeToggle button component for phryvos-k9 dual theme.
 *
 * Importers/callers:
 *   - components/shell/AppShell.tsx
 *   - components/settings/ThemePanel.tsx
 *
 * Affected API: None (client-side toggle).
 * Data schemas: None (uses localStorage).
 * User instruction verbatim: "1. i want dual theme dark and light"
 */
"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${className}`}
      title={resolvedTheme === "dark" ? "Switch to Light mode" : "Switch to Dark mode"}
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4 text-amber-400 transition-transform duration-200" />
      ) : (
        <Moon className="h-4 w-4 text-zinc-600 transition-transform duration-200" />
      )}
    </button>
  );
}
