"use client";

import * as React from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { createPortal } from "react-dom";

/**
 * Toast primitive for notifications, undo actions, and save confirmations
 *
 * Importers/callers: components/chat/ChatApp.tsx, components/vault/FilesApp.tsx, components/tasks/TasksApp.tsx, app/(app)/layout.tsx
 * Affected API: React Context + Portal with auto-dismiss timer, action support, variant icons
 * Data schemas: ToastProps, ToastContextValue
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Toast"
 */
export interface ToastProps {
  id: string;
  title?: string;
  description?: React.ReactNode;
  variant?: "default" | "success" | "warning" | "destructive" | "info";
  action?: React.ReactNode;
  duration?: number;
  onClose?: (id: string) => void;
}

export interface ToastContextValue {
  toasts: ToastProps[];
  addToast: (toast: Omit<ToastProps, "id">) => string;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const variantIcons: Record<string, React.ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-emerald-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  destructive: <AlertCircle className="h-5 w-5 text-red-500" />,
  info: <Info className="h-5 w-5 text-sky-500" />,
  default: null,
};

const variantStyles: Record<string, string> = {
  success: "border-l-4 border-emerald-500",
  warning: "border-l-4 border-amber-500",
  destructive: "border-l-4 border-red-500",
  info: "border-l-4 border-sky-500",
  default: "border-l-4 border-zinc-500",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastProps[]>([]);

  const addToast = React.useCallback((toast: Omit<ToastProps, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newToast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastViewport />
    </ToastContext.Provider>
  );
}

function ToastViewport() {
  const context = React.useContext(ToastContext);
  if (!context || !context.toasts.length) return null;
  const { toasts } = context;

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast: ToastProps) => (
        <ToastItem key={toast.id} {...toast} />
      ))}
    </div>,
    document.body
  );
}

function ToastItem({ id, title, description, variant = "default", action, duration = 5000, onClose }: ToastProps) {
  const context = React.useContext(ToastContext);
  const removeToast = context?.removeToast || (() => {});

  React.useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(id);
      onClose?.(id);
    }, duration);
    return () => clearTimeout(timer);
  }, [id, duration, removeToast, onClose]);

  return (
    <div
      className={`
        pointer-events-auto flex items-start gap-3 p-4 rounded-lg bg-card border shadow-lg
        min-w-[300px] max-w-[480px] animate-slide-up
        ${variantStyles[variant]}
      `}
      role="alert"
    >
      {variantIcons[variant] && <div className="flex-shrink-0 mt-0.5">{variantIcons[variant]}</div>}
      <div className="flex-1 min-w-0">
        {title && <h4 className="font-medium text-sm">{title}</h4>}
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
      <button
        onClick={() => { removeToast(id); onClose?.(id); }}
        className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}