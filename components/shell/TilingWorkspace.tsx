"use client";

/**
 * Tiling Workspace — split-pane layout with Alt+V/Alt+C toggles
 * Persists layout in localStorage, supports drag resize
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface Pane {
  id: string;
  type: "chat" | "vault" | "tasks" | "exams" | "projects" | "goals" | "calendar" | "settings" | "artifact";
  route?: string;
  title?: string;
}

export interface TilingLayout {
  direction: "vertical" | "horizontal";
  panes: (Pane | TilingLayout)[];
  sizes: number[]; // percentage weights
}

const DEFAULT_LAYOUT: TilingLayout = {
  direction: "vertical",
  panes: [
    { id: "chat", type: "chat", title: "Chat" },
    { id: "vault", type: "vault", title: "Vault" },
  ],
  sizes: [50, 50],
};

const STORAGE_KEY = "phryvos:tiling-layout";

function generateId(): string {
  return `pane_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function splitPane(layout: TilingLayout, paneId: string, direction: "vertical" | "horizontal", newPane: Pane): TilingLayout {
  const newLayout = deepClone(layout);

  function findAndSplit(node: TilingLayout): boolean {
    for (let i = 0; i < node.panes.length; i++) {
      const pane = node.panes[i];
      if ("id" in pane && pane.id === paneId) {
        const newLayout2: TilingLayout = {
          direction,
          panes: [pane, newPane],
          sizes: [50, 50],
        };
        node.panes[i] = newLayout2;
        node.sizes = [100];
        return true;
      } else if (!("id" in pane)) {
        if (findAndSplit(pane)) return true;
      }
    }
    return false;
  }

  findAndSplit(newLayout);
  return newLayout;
}

function removePane(layout: TilingLayout, paneId: string): TilingLayout | null {
  const newLayout = deepClone(layout);

  function findAndRemove(node: TilingLayout, parent: TilingLayout | null, parentIndex: number): boolean {
    for (let i = 0; i < node.panes.length; i++) {
      const pane = node.panes[i];
      if ("id" in pane && pane.id === paneId) {
        node.panes.splice(i, 1);
        node.sizes.splice(i, 1);

        if (node.panes.length === 1 && parent) {
          parent.panes[parentIndex] = node.panes[0];
          parent.sizes.splice(parentIndex, 1);
        }
        return true;
      } else if (!("id" in pane)) {
        if (findAndRemove(pane, node, i)) return true;
      }
    }
    return false;
  }

  if (findAndRemove(newLayout, null, -1)) {
    if (newLayout.panes.length === 1 && !("id" in newLayout.panes[0])) {
      return newLayout.panes[0] as TilingLayout;
    }
    return newLayout;
  }
  return null;
}

export function TilingWorkspace({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [layout, setLayout] = useState<TilingLayout>(() => {
    if (typeof window === "undefined") return DEFAULT_LAYOUT;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    return DEFAULT_LAYOUT;
  });

  const [dragging, setDragging] = useState<{ layoutIndex: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.altKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        splitCurrentPane("vertical");
      }
      if ((e.altKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        splitCurrentPane("horizontal");
      }
      if ((e.altKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        toggleZenMode();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [layout]);

  const splitCurrentPane = useCallback((direction: "vertical" | "horizontal") => {
    setLayout((prev) => {
      function findFirstLeaf(node: TilingLayout): string | null {
        for (const pane of node.panes) {
          if ("id" in pane) return pane.id;
          const found = findFirstLeaf(pane);
          if (found) return found;
        }
        return null;
      }

      const firstPaneId = findFirstLeaf(prev);
      if (!firstPaneId) return prev;

      const newPane: Pane = {
        id: generateId(),
        type: "artifact",
        title: "Artifact",
      };

      return splitPane(prev, firstPaneId, direction, newPane);
    });
  }, []);

  const toggleZenMode = useCallback(() => {
    console.log("[TilingWorkspace] Zen mode toggle");
  }, []);

  const handleResize = useCallback((index: number, deltaX: number, deltaY: number) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const totalSize = layout.direction === "vertical" ? rect.width : rect.height;
    const percentDelta = (layout.direction === "vertical" ? deltaX : deltaY) / totalSize * 100;

    setLayout((prev) => {
      const newSizes = [...prev.sizes];
      const current = newSizes[index];
      const next = newSizes[index + 1];
      const newCurrent = current + percentDelta;
      const newNext = next - percentDelta;

      if (newCurrent < 15 || newNext < 15) return prev;

      newSizes[index] = newCurrent;
      newSizes[index + 1] = newNext;
      return { ...prev, sizes: newSizes };
    });
  }, [layout.direction]);

  const handleDragStart = (index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging({ layoutIndex: index });

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleResize(index, moveEvent.movementX, moveEvent.movementY);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setDragging(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const renderPane = (pane: Pane | TilingLayout, index: number, parentDirection: "vertical" | "horizontal"): React.ReactNode => {
    if ("id" in pane) {
      return (
        <div
          key={pane.id}
          className={cn(
            "relative flex flex-col overflow-hidden bg-neutral-950/80",
            parentDirection === "vertical" ? "w-[var(--pane-width)]" : "h-[var(--pane-height)]"
          )}
          style={{
            width: parentDirection === "vertical" ? `${layout.sizes[index]}%` : undefined,
            height: parentDirection === "horizontal" ? `${layout.sizes[index]}%` : undefined,
            "--pane-width": parentDirection === "vertical" ? `${layout.sizes[index]}%` : undefined,
            "--pane-height": parentDirection === "horizontal" ? `${layout.sizes[index]}%` : undefined,
          } as React.CSSProperties}
        >
          <div className="flex items-center justify-between px-2 py-1 bg-neutral-900/80 border-b border-neutral-800 text-xs font-mono text-neutral-400">
            <span>{pane.title || pane.type}</span>
            <button
              onClick={() => {
                setLayout((prev) => removePane(prev, pane.id) || prev);
              }}
              className="p-1 hover:bg-neutral-800 rounded text-neutral-500 hover:text-neutral-100 transition-colors"
              aria-label="Close pane"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2">{children}</div>
        </div>
      );
    } else {
      return (
        <div
          key={pane.direction}
          className={cn(
            "flex overflow-hidden",
            pane.direction === "vertical" ? "flex-row" : "flex-col"
          )}
        >
          {pane.panes.map((child, i) => (
            <React.Fragment key={`${pane.direction}-${i}`}>
              {renderPane(child, i, pane.direction)}
              {i < pane.panes.length - 1 && (
                <div
                  className={cn(
                    "relative flex-shrink-0 select-none transition-colors",
                    pane.direction === "vertical" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
                    dragging?.layoutIndex === i ? "bg-cyan-500/80" : "bg-neutral-800 hover:bg-cyan-500/40"
                  )}
                  style={{
                    width: pane.direction === "vertical" ? "4px" : undefined,
                    height: pane.direction === "horizontal" ? "4px" : undefined,
                  }}
                  onMouseDown={handleDragStart(i)}
                  aria-label={`Resize ${pane.direction} split`}
                >
                  {dragging?.layoutIndex === i && (
                    <div className="absolute inset-0 bg-cyan-500/20 animate-pulse" />
                  )}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      );
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex-1 flex overflow-hidden",
        layout.direction === "vertical" ? "flex-row" : "flex-col",
        className
      )}
    >
      {renderPane(layout, 0, layout.direction)}
    </div>
  );
}

export function TilingToolbar({
  onSplitVertical,
  onSplitHorizontal,
  onZenMode,
}: {
  onSplitVertical: () => void;
  onSplitHorizontal: () => void;
  onZenMode: () => void;
}) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-neutral-900/90 backdrop-blur rounded-lg border border-neutral-800 px-3 py-1.5 shadow-lg">
      <button
        onClick={onSplitVertical}
        className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-neutral-100 transition-colors"
        title="Split Vertical (Alt+V)"
        aria-label="Split Vertical"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="12" y1="3" x2="12" y2="21" />
        </svg>
      </button>
      <button
        onClick={onSplitHorizontal}
        className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-neutral-100 transition-colors"
        title="Split Horizontal (Alt+C)"
        aria-label="Split Horizontal"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      </button>
      <button
        onClick={onZenMode}
        className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-neutral-100 transition-colors"
        title="Zen Mode (Alt+Z)"
        aria-label="Zen Mode"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      </button>
    </div>
  );
}