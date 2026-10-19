"use client";

import * as React from "react";
import { AlertCircle, RefreshCw, WifiOff, Lock, Server } from "lucide-react";

/**
 * ErrorState primitive for error recovery, offline detection, and vault lock states
 *
 * Importers/callers: components/vault/FilesApp.tsx, components/chat/ChatApp.tsx, components/settings/SettingsView.tsx, app/(app)/layout.tsx
 * Affected API: Composed component with variant-specific icons and retry action
 * Data schemas: ErrorStateProps with title, description, variant (5 types), action, onRetry
 * User instruction verbatim: "continue"
 */
export interface ErrorStateProps {
  title?: string;
  description?: string;
  variant?: "default" | "network" | "locked" | "server" | "permission";
  action?: React.ReactNode;
  className?: string;
  onRetry?: () => void;
}

const variantConfigs: Record<string, { icon: React.ReactNode; defaultTitle: string; defaultDescription: string }> = {
  default: { icon: <AlertCircle className="h-12 w-12 text-destructive/50" />, defaultTitle: "Something went wrong", defaultDescription: "An unexpected error occurred. Please try again." },
  network: { icon: <WifiOff className="h-12 w-12 text-destructive/50" />, defaultTitle: "Connection lost", defaultDescription: "Unable to reach the server. Check your connection and try again." },
  locked: { icon: <Lock className="h-12 w-12 text-destructive/50" />, defaultTitle: "Vault locked", defaultDescription: "The vault is locked. Unlock to access your data." },
  server: { icon: <Server className="h-12 w-12 text-destructive/50" />, defaultTitle: "Server error", defaultDescription: "The server encountered an error. Please try again later." },
  permission: { icon: <AlertCircle className="h-12 w-12 text-destructive/50" />, defaultTitle: "Access denied", defaultDescription: "You don't have permission to perform this action." },
};

export function ErrorState({ title, description, variant = "default", action, className, onRetry }: ErrorStateProps) {
  const config = variantConfigs[variant];

  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className || ""}`}>
      <div className="mb-4">{config.icon}</div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title || config.defaultTitle}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">{description || config.defaultDescription}</p>
      <div className="flex items-center gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        )}
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}