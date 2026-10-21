"use client";

import * as React from "react";

export interface LoadingIndicatorProps {
  message?: string;
  description?: string;
  variant?: "spinner" | "skeleton" | "dots";
  delayMs?: number; // threshold before showing
  className?: string;
}

/**
 * 3-Tier Loading Policy (Strict No-Skeleton Policy):
 * - <50ms: Null fallback (instant response, zero layout flicker)
 * - 50ms - 300ms: Centered 3-dot pulse in --fg-3
 * - >300ms: Named progress message in --text-sm --fg-2
 */
export function LoadingIndicator({
  message = "Loading...",
  delayMs = 80,
  className = "",
}: LoadingIndicatorProps) {
  const [tier, setTier] = React.useState<"none" | "dots" | "named">("none");

  React.useEffect(() => {
    const timer1 = setTimeout(() => {
      setTier("dots");
    }, delayMs);

    const timer2 = setTimeout(() => {
      setTier("named");
    }, 300);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [delayMs]);

  if (tier === "none") return null;

  return (
    <div className={`flex flex-col items-center justify-center py-10 px-4 text-center select-none ${className}`}>
      {/* 3-dot pulse in --fg-3 */}
      <div className="flex items-center gap-1.5 mb-2.5" aria-label="Loading">
        <div className="h-1.5 w-1.5 rounded-full bg-[var(--fg-3)] animate-pulse" />
        <div className="h-1.5 w-1.5 rounded-full bg-[var(--fg-3)] animate-pulse [animation-delay:150ms]" />
        <div className="h-1.5 w-1.5 rounded-full bg-[var(--fg-3)] animate-pulse [animation-delay:300ms]" />
      </div>

      {tier === "named" && message && (
        <p className="text-[var(--text-xs)] text-[var(--fg-2)] tracking-wide">
          {message}
        </p>
      )}
    </div>
  );
}

// Backward-compatible alias for existing imports
export const LoadingState = LoadingIndicator;
