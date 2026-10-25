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
      className={`relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)] text-[var(--fg-1)] transition hover:bg-[var(--bg-2)] hover:text-[var(--fg-0)] active:scale-95 ${className}`}
      title={resolvedTheme === "dark" ? "Switch to Light mode" : "Switch to Dark mode"}
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4 text-[var(--warning)] transition-transform duration-200" />
      ) : (
        <Moon className="h-4 w-4 text-[var(--fg-1)] transition-transform duration-200" />
      )}
    </button>
  );
}
