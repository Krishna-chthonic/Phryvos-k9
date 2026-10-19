"use client";

import * as React from "react";

/**
 * Separator primitive for visual grouping and section dividers
 *
 * Importers/callers: components/shell/AppShell.tsx, components/vault/FileTree.tsx, components/settings/SettingsView.tsx
 * Affected API: HTML HR element with orientation and decorative props
 * Data schemas: SeparatorProps with orientation, decorative
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Separator"
 */
export interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

export const Separator: React.FC<SeparatorProps> = ({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}) => (
  <hr
    className={`
      bg-border
      ${orientation === "horizontal" ? "w-full h-px" : "h-full w-px"}
      ${className || ""}
    `}
    role={decorative ? "none" : "separator"}
    aria-orientation={decorative ? undefined : orientation}
    {...props}
  />
);