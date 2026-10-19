"use client";

import * as React from "react";

/**
 * Skeleton primitive for loading states in lists, messages, and content areas
 *
 * Importers/callers: components/chat/ChatApp.tsx, components/vault/FileTree.tsx, components/tasks/TasksApp.tsx
 * Affected API: HTMLDivElement with animated pulse, variant-based rendering
 * Data schemas: SkeletonProps with variant, width, height, lines
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Skeleton"
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular";
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function Skeleton({ className, variant = "text", width, height, lines = 3, ...props }: SkeletonProps) {
  const baseClass = "animate-pulse-soft bg-muted rounded";

  if (variant === "circular") {
    return (
      <div
        className={`${baseClass} rounded-full ${className}`}
        style={{ width, height }}
        {...props}
      />
    );
  }

  if (variant === "rectangular") {
    return (
      <div
        className={`${baseClass} ${className}`}
        style={{ width, height }}
        {...props}
      />
    );
  }

  // text variant - multiple lines
  return (
    <div className={`${className}`} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`${baseClass} h-4 ${i === lines - 1 ? "w-3/4" : "w-full"} mb-2`}
          style={{ width: i === lines - 1 ? width : undefined }}
        />
      ))}
    </div>
  );
}