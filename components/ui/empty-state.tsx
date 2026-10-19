"use client";

import * as React from "react";
import { FileText, Search, FolderOpen, MessageSquare, CheckCircle, Clock, AlertCircle } from "lucide-react";

/**
 * EmptyState primitive for no data, no results, and initial states
 *
 * Importers/callers: components/vault/FileTree.tsx, components/chat/ChatApp.tsx, components/tasks/TasksApp.tsx, components/exams/ExamsApp.tsx
 * Affected API: Composed component with preset icons for common empty states
 * Data schemas: EmptyStateProps with icon, title, description, action; preset icons map
 * User instruction verbatim: "Phase 6: Core component library (primitives) - EmptyState"
 */
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

const presetIcons: Record<string, React.ReactNode> = {
  files: <FolderOpen className="h-12 w-12 text-muted-foreground/50" />,
  chat: <MessageSquare className="h-12 w-12 text-muted-foreground/50" />,
  search: <Search className="h-12 w-12 text-muted-foreground/50" />,
  tasks: <CheckCircle className="h-12 w-12 text-muted-foreground/50" />,
  notes: <FileText className="h-12 w-12 text-muted-foreground/50" />,
  loading: <Clock className="h-12 w-12 text-muted-foreground/50 animate-pulse-soft" />,
  error: <AlertCircle className="h-12 w-12 text-destructive/50" />,
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      {icon && <div className="mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm mb-6">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function EmptyStatePreset({ preset, title, description, action, className }: { preset: keyof typeof presetIcons } & Omit<EmptyStateProps, "icon">) {
  return <EmptyState icon={presetIcons[preset]} title={title} description={description} action={action} className={className} />;
}