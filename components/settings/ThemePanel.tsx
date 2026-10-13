/**
 * Theme selection panel for phryvos-k9 Settings page.
 *
 * Importers/callers: app/(app)/settings/page.tsx
 * Affected API: None
 * Data schemas if any: None
 * User instruction verbatim: "1. i want dual theme dark and light"
 */
"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/components/theme/ThemeProvider";

export function ThemePanel() {
  const { theme, setTheme } = useTheme();

  const options: Array<{ id: Theme; label: string; desc: string; icon: typeof Sun }> = [
    {
      id: "light",
      label: "Light Mode",
      desc: "Clean white interface with crisp contrast",
      icon: Sun,
    },
    {
      id: "dark",
      label: "Dark Mode",
      desc: "ChatGPT-style deep dark aesthetic, easy on the eyes",
      icon: Moon,
    },
    {
      id: "system",
      label: "System Theme",
      desc: "Automatically syncs with your device display settings",
      icon: Monitor,
    },
  ];

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Interface Appearance
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Choose between light and dark visual themes across all vault screens.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {options.map((opt) => {
          const Icon = opt.icon;
          const active = theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTheme(opt.id)}
              className={`flex flex-col items-start rounded-lg border p-3.5 text-left transition-all ${
                active
                  ? "border-zinc-400 bg-zinc-100/80 ring-1 ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:ring-zinc-600"
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
              }`}
            >
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {opt.label}
              </span>
              <span className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
