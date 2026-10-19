"use client";

import * as React from "react";
import { AlertTriangle, AlertCircle, HelpCircle } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogDescription } from "./dialog";
import { Button } from "./button";

/**
 * ConfirmationDialog primitive for destructive actions, lock confirmation, and deletions
 *
 * Importers/callers: components/vault/FilesApp.tsx, components/chat/ChatApp.tsx, components/tasks/TasksApp.tsx, components/shell/AppShell.tsx
 * Affected API: Specialized wrapper around Dialog with variant-based icons and actions
 * Data schemas: ConfirmationDialogProps
 * User instruction verbatim: "continue"
 */
export interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "warning" | "default";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Caller handles error notification
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const iconMap = {
    destructive: <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0" />,
    warning: <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0" />,
    default: <HelpCircle className="h-6 w-6 text-zinc-600 dark:text-zinc-400 flex-shrink-0" />,
  };

  const buttonVariantMap: Record<string, "destructive" | "warning" | "primary"> = {
    destructive: "destructive",
    warning: "warning",
    default: "primary",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-4 p-6 pb-2">
          {iconMap[variant]}
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold leading-6">{title}</DialogTitle>
            <div className="mt-2 text-sm text-muted-foreground">
              {typeof description === "string" ? <DialogDescription>{description}</DialogDescription> : description}
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 border-t mt-4">
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={handleCancel}
            disabled={loading || isSubmitting}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={buttonVariantMap[variant]}
            size="md"
            loading={loading || isSubmitting}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}