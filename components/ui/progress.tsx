"use client";

import * as React from "react";

/**
 * Progress primitive for upload, compaction, study progress, and task completion
 *
 * Importers/callers: components/chat/ChatApp.tsx, components/vault/FilesApp.tsx, components/exams/ExamsApp.tsx, components/tasks/TasksApp.tsx
 * Affected API: HTMLDivElement (linear) + SVG (circular) with ARIA progressbar role
 * Data schemas: ProgressProps, ProgressCircleProps
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Progress"
 */
export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  variant?: "default" | "success" | "warning" | "destructive" | "info";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  label?: string;
}

export function Progress({ className, value = 0, max = 100, variant = "default", size = "md", showLabel = false, label, ...props }: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const variantStyles: Record<string, string> = {
    default: "bg-zinc-900 dark:bg-zinc-100",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    destructive: "bg-red-500",
    info: "bg-sky-500",
  };

  const sizeStyles: Record<string, string> = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  return (
    <div className={className} {...props}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-muted-foreground">{label || "Progress"}</span>
          {showLabel && <span className="text-xs font-mono text-muted-foreground">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div
        className={`
          relative w-full overflow-hidden rounded-full bg-muted
          ${sizeStyles[size]}
        `}
        role="progressbar"
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={`
            h-full rounded-full transition-all duration-300 ease-out
            ${variantStyles[variant]}
          `}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export interface ProgressCircleProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  variant?: "default" | "success" | "warning" | "destructive" | "info";
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  label?: string;
  children?: React.ReactNode;
}

export function ProgressCircle({ className, value = 0, max = 100, variant = "default", size = 48, strokeWidth = 4, showLabel = false, label, children, ...props }: ProgressCircleProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const variantStyles: Record<string, string> = {
    default: "text-zinc-900 dark:text-zinc-100",
    success: "text-emerald-500",
    warning: "text-amber-500",
    destructive: "text-red-500",
    info: "text-sky-500",
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }} {...props}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="text-muted"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={`
            transition-all duration-500 ease-out
            ${variantStyles[variant]}
          `}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children || (showLabel && <span className="text-xs font-bold">{Math.round(percentage)}%</span>)}
      </div>
    </div>
  );
}