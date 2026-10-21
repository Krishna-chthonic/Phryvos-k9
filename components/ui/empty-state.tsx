"use client";

import * as React from "react";
import { FolderOpen, MessageSquare, Search, CheckCircle, Clock, AlertCircle } from "lucide-react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  preset?: "files" | "chat" | "search" | "tasks" | "loading" | "error";
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

const presetIcons: Record<string, React.ReactNode> = {
  files: <FolderOpen className="h-8 w-8 text-[var(--fg-3)] stroke-[1.5]" />,
  chat: <MessageSquare className="h-8 w-8 text-[var(--fg-3)] stroke-[1.5]" />,
  search: <Search className="h-8 w-8 text-[var(--fg-3)] stroke-[1.5]" />,
  tasks: <CheckCircle className="h-8 w-8 text-[var(--fg-3)] stroke-[1.5]" />,
  loading: <Clock className="h-8 w-8 text-[var(--fg-3)] animate-pulse stroke-[1.5]" />,
  error: <AlertCircle className="h-8 w-8 text-[var(--danger)]/60 stroke-[1.5]" />,
};

export function EmptyState({
  icon,
  preset,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  const displayIcon = icon || (preset ? presetIcons[preset] : null);

  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center select-none ${className}`}
    >
      {displayIcon && <div className="mb-3 text-[var(--fg-3)]">{displayIcon}</div>}
      <h3 className="text-[var(--text-md)] font-medium text-[var(--fg-1)]">
        {title}
      </h3>
      {description && (
        <p className="text-[var(--text-sm)] text-[var(--fg-2)] max-w-[320px] mt-2 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function EmptyStatePreset({
  preset,
  title,
  description,
  action,
  className,
}: { preset: "files" | "chat" | "search" | "tasks" | "loading" | "error" } & Omit<
  EmptyStateProps,
  "icon" | "preset"
>) {
  return (
    <EmptyState
      preset={preset}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}
