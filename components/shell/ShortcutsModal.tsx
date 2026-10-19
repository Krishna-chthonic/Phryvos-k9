"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  GLOBAL_SHORTCUTS,
  ShortcutCategory,
  isMacOS,
  formatShortcut,
} from "@/lib/shortcuts/shortcut-registry";
import { Keyboard } from "lucide-react";

/**
 * Keyboard Shortcuts Cheat Sheet Modal (Phase 12)
 *
 * Importers/callers: components/shell/AppShell.tsx
 * Affected API: Modal overlay for quick discovery
 * Data schemas: GLOBAL_SHORTCUTS
 * User instruction verbatim: "continue"
 */

export interface ShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsModal({ open, onOpenChange }: ShortcutsModalProps) {
  const [isMac, setIsMac] = React.useState(false);

  React.useEffect(() => {
    setIsMac(isMacOS());
  }, []);

  const categories: ShortcutCategory[] = [
    "Navigation",
    "Vault & Editor",
    "AI & Chat",
    "System & Security",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-800 dark:text-zinc-100">
              <Keyboard className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">Keyboard Shortcuts</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Quick key bindings for high-speed frontier keyboard navigation
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-2 space-y-6">
          {categories.map((category) => {
            const list = GLOBAL_SHORTCUTS.filter((s) => s.category === category);
            if (list.length === 0) return null;

            return (
              <div key={category} className="space-y-2">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  {category}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {list.map((shortcut) => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between p-2 rounded-lg border border-zinc-100 dark:border-zinc-850 bg-zinc-50/50 dark:bg-zinc-900/40 text-xs"
                    >
                      <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate pr-2">
                        {shortcut.label}
                      </span>
                      <kbd className="inline-flex items-center px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 shadow-2xs shrink-0">
                        {formatShortcut(shortcut.keys, isMac)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="p-6 pt-3 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close (Esc)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
