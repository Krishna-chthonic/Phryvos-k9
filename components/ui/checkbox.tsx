"use client";

import * as React from "react";

/**
 * Checkbox primitive with indeterminate state and accessibility support
 *
 * Importers/callers: components/tasks/TasksApp.tsx, components/settings/SettingsView.tsx
 * Affected API: HTMLInputElement checkbox props + ARIA states
 * Data schemas: CheckboxProps
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Checkbox"
 */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  description?: string;
  error?: boolean | string;
  indeterminate?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, error, indeterminate, id, disabled, required, checked, onChange, ...props }, ref) => {
    const internalRef = React.useRef<HTMLInputElement | null>(null);
    const checkboxId = id || `checkbox-${React.useId()}`;

    React.useEffect(() => {
      if (internalRef.current) {
        internalRef.current.indeterminate = Boolean(indeterminate);
      }
    }, [indeterminate]);

    const handleRef = (node: HTMLInputElement | null) => {
      internalRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
      }
    };

    return (
      <label className="flex items-start gap-3 cursor-pointer select-none">
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            ref={handleRef}
            type="checkbox"
            id={checkboxId}
            checked={checked}
            onChange={onChange}
            className={`
              h-4 w-4 rounded border appearance-none cursor-pointer
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
              disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed
              checked:bg-zinc-900 checked:border-zinc-900 dark:checked:bg-zinc-100 dark:checked:border-zinc-100
              ${error ? "border-red-500 text-red-600" : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"}
              ${className}
            `}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={description ? `${checkboxId}-desc` : undefined}
            {...props}
          />
          {checked && !indeterminate && (
            <svg
              className="absolute w-3 h-3 text-white dark:text-zinc-900 pointer-events-none stroke-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {indeterminate && (
            <div className="absolute w-2 h-0.5 bg-zinc-900 dark:bg-zinc-100 pointer-events-none" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {label && (
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {label}
              {required && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
            </span>
          )}
          {description && (
            <p id={`${checkboxId}-desc`} className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {description}
            </p>
          )}
          {error && (
            <p className="mt-0.5 text-xs text-red-600 dark:text-red-400" role="alert">
              {typeof error === "string" ? error : "Invalid input"}
            </p>
          )}
        </div>
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";