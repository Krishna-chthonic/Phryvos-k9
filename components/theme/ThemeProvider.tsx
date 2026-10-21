/**
 * Theme Provider context for phryvos-k9 dual theme (light, dark, system).
 *
 * Importers/callers:
 *   - app/layout.tsx
 *   - components/theme/ThemeToggle.tsx
 *   - components/settings/ThemePanel.tsx
 *   - components/shell/AppShell.tsx
 *
 * Affected API: None (client-side UI state and localStorage).
 * Data schemas affected: None (browser localStorage 'phryvos_theme').
 * User instruction verbatim: "1. i want dual theme dark and light"
 */
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("phryvos_theme") as Theme | null;
    if (saved && (saved === "light" || saved === "dark" || saved === "system")) {
      setThemeState(saved);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function apply() {
      let active: "light" | "dark" = "light";
      if (theme === "system") {
        active = media.matches ? "dark" : "light";
      } else {
        active = theme;
      }

      setResolvedTheme(active);

      const root = document.documentElement;
      root.setAttribute("data-theme", active);
      if (active === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    apply();

    function onChange() {
      if (theme === "system") apply();
    }

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem("phryvos_theme", next);
  };

  const toggleTheme = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
