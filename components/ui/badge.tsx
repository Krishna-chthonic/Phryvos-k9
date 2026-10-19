"use client";

import * as React from "react";

/**
 * Badge primitive for status indicators, labels, and tags
 *
 * Importers/callers: components/chat/ChatMessage.tsx, components/vault/FileTree.tsx, components/tasks/TaskCard.tsx, components/exams/ExamProgress.tsx
 * Affected API: HTMLSpanElement with variant/size/dot props
 * Data schemas: BadgeProps with variant (8), size (3), dot indicator
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Badge"
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "destructive" | "success" | "warning" | "info" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  dot?: boolean;
  dotColor?: string;
}

const variantStyles: Record<string, string> = {
  default: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
  secondary: "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
  destructive: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  info: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  outline: "bg-transparent border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300",
  ghost: "bg-transparent text-zinc-600 dark:text-zinc-400",
};

const sizeStyles: Record<string, string> = {
  sm: "px-2 py-0.5 text-[0.625rem]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1 text-sm",
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", size = "md", dot, dotColor, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={`
          inline-flex items-center gap-1.5 font-medium rounded-full
          ${variantStyles[variant]} ${sizeStyles[size]} ${className}
        `}
        {...props}
      >
        {dot && (
          <span
            className={`
              h-1.5 w-1.5 rounded-full flex-shrink-0
              ${dotColor || (variant === "success" ? "bg-emerald-500" : variant === "warning" ? "bg-amber-500" : variant === "destructive" ? "bg-red-500" : variant === "info" ? "bg-sky-500" : "bg-zinc-500")}
            `}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    );
  }
);
Badge.displayName = "Badge";