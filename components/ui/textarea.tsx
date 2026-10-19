"use client";

import * as React from "react";

/**
 * Textarea primitive for forms, composers, and editors
 *
 * Importers/callers:
 * - components/chat/ChatComposer.tsx (chat message input)
 * - components/vault/EditorPane.tsx (file editor fallback)
 * - components/settings/SettingsForms.tsx (multi-line settings)
 *
 * Affected API: React TextareaHTMLAttributes + custom props
 * Data schemas: TextareaProps extends standard HTML textarea attributes
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Textarea"
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean | string;
  label?: string;
  helperText?: string;
  loading?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, label, helperText, loading, id, disabled, required, ...props }, ref) => {
    const textareaId = id || `textarea-${React.useId()}`;
    const helperId = helperText ? `${textareaId}-helper` : undefined;
    const errorId = error ? `${textareaId}-error` : undefined;
    const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            {label}
            {required && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`
            w-full rounded-lg border px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400
            focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-ring
            transition-colors duration-150
            disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed
            dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500
            dark:focus:border-zinc-600 dark:focus:ring-zinc-800
            ${error ? "border-red-500 dark:border-red-500 focus:border-red-500 focus:ring-red-500/20" : "border-zinc-300 dark:border-zinc-700"}
            ${loading ? "bg-zinc-50 dark:bg-zinc-800/50" : ""}
            ${className}
          `}
          disabled={disabled || loading}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          aria-busy={loading}
          {...props}
        />
        {error && (
          <p id={errorId} className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
            {typeof error === "string" ? error : "Invalid input"}
          </p>
        )}
        {!error && helperText && (
          <p id={helperId} className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";