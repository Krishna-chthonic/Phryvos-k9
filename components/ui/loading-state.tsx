"use client";

import * as React from "react";
import { Skeleton } from "./skeleton";

/**
 * LoadingState composite primitive combining spinners, dots, and skeleton fallbacks
 *
 * Importers/callers: components/chat/ChatApp.tsx, components/vault/FilesApp.tsx, components/tasks/TasksApp.tsx
 * Affected API: Composed component with variant-based rendering (spinner, dots, skeleton)
 * Data schemas: LoadingStateProps
 * User instruction verbatim: "continue"
 */
export interface LoadingStateProps {
  message?: string;
  description?: string;
  variant?: "spinner" | "skeleton" | "dots";
  className?: string;
}

export function LoadingState({
  message = "Loading...",
  description,
  variant = "spinner",
  className = "",
}: LoadingStateProps) {
  if (variant === "skeleton") {
    return (
      <div className={`p-6 space-y-4 max-w-lg mx-auto ${className}`}>
        <div className="flex items-center gap-3">
          <Skeleton variant="circular" width={36} height={36} />
          <div className="space-y-1.5 flex-1">
            <Skeleton variant="text" lines={1} className="w-1/3" />
            <Skeleton variant="text" lines={1} className="w-2/3" />
          </div>
        </div>
        <Skeleton variant="text" lines={4} />
      </div>
    );
  }

  if (variant === "dots") {
    return (
      <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
        <div className="flex items-center gap-1.5 mb-3" aria-label="Loading">
          <div className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-zinc-100 animate-pulse-soft" />
          <div className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-zinc-100 animate-pulse-soft [animation-delay:200ms]" />
          <div className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-zinc-100 animate-pulse-soft [animation-delay:400ms]" />
        </div>
        {message && <p className="text-sm font-medium text-foreground">{message}</p>}
        {description && <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>}
      </div>
    );
  }

  // Spinner variant (default)
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <svg
        className="h-8 w-8 text-zinc-900 dark:text-zinc-100 animate-spin mb-3"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {message && <p className="text-sm font-medium text-foreground">{message}</p>}
      {description && <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>}
    </div>
  );
}