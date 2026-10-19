"use client";

import * as React from "react";

/**
 * Tooltip primitive for contextual help on icon-only buttons and truncated text
 *
 * Importers/callers: components/shell/AppShell.tsx, components/chat/ChatMessage.tsx, components/vault/FileTree.tsx, components/ui/button.tsx
 * Affected API: React element wrapper with positioning logic + mouse/focus events
 * Data schemas: TooltipProps with content, side, align, delayDuration
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Tooltip"
 */
export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delayDuration?: number;
  skipDelayDuration?: number;
}

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delayDuration = 700,
  skipDelayDuration = 300,
}: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const childRef = React.useRef<HTMLElement>(null);
  const delayTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const skipTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showTooltip = () => {
    delayTimer.current = setTimeout(() => {
      if (childRef.current && tooltipRef.current) {
        const rect = childRef.current.getBoundingClientRect();
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        let x = 0, y = 0;

        switch (side) {
          case "top":
            x = rect.left + rect.width / 2 - tooltipRect.width / 2;
            y = rect.top - tooltipRect.height - 8;
            break;
          case "bottom":
            x = rect.left + rect.width / 2 - tooltipRect.width / 2;
            y = rect.bottom + 8;
            break;
          case "left":
            x = rect.left - tooltipRect.width - 8;
            y = rect.top + rect.height / 2 - tooltipRect.height / 2;
            break;
          case "right":
            x = rect.right + 8;
            y = rect.top + rect.height / 2 - tooltipRect.height / 2;
            break;
        }

        if (align === "start") {
          if (side === "top" || side === "bottom") x = rect.left;
          else y = rect.top;
        } else if (align === "end") {
          if (side === "top" || side === "bottom") x = rect.right - tooltipRect.width;
          else y = rect.bottom - tooltipRect.height;
        }

        setPosition({ x, y });
      }
      setOpen(true);
    }, delayDuration);
  };

  const hideTooltip = () => {
    if (delayTimer.current) clearTimeout(delayTimer.current);
    skipTimer.current = setTimeout(() => setOpen(false), skipDelayDuration);
  };

  const handleMouseEnter = () => {
    if (skipTimer.current) clearTimeout(skipTimer.current);
    showTooltip();
  };

  const handleMouseLeave = () => {
    hideTooltip();
  };

  const handleFocus = () => {
    showTooltip();
  };

  const handleBlur = () => {
    hideTooltip();
  };

  const child = React.isValidElement(children) ? children : <span>{children}</span>;

  return (
    <>
      {React.cloneElement(child, {
        ref: childRef,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onFocus: handleFocus,
        onBlur: handleBlur,
      })}
      {open && (
        <div
          ref={tooltipRef}
          style={{
            position: "fixed",
            left: position.x,
            top: position.y,
            zIndex: 50,
            pointerEvents: "none",
          }}
          className="bg-zinc-900 text-white text-xs px-2 py-1 rounded shadow-lg dark:bg-zinc-100 dark:text-zinc-900 animate-fade-in"
          role="tooltip"
        >
          {content}
        </div>
      )}
    </>
  );
}