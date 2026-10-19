"use client";

import * as React from "react";

/**
 * Switch primitive for boolean settings with accessibility
 *
 * Importers/callers: components/settings/SettingsView.tsx, components/vault/VaultToolbar.tsx
 * Affected API: HTMLInputElement with role="switch" + ARIA
 * Data schemas: SwitchProps
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Switch"
 */
export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  description?: string;
  error?: boolean | string;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, description, error, id, disabled, required, ...props }, ref) => {
    const switchId = id || `switch-${React.useId()}`;

    return (
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div className="relative">
          <input
            ref={ref}
            type="checkbox"
            id={switchId}
            role="switch"
            className={`
              peer h-5 w-9 appearance-none rounded-full border-2
              transition-colors duration-150
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
              disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed
              bg-zinc-300 dark:bg-zinc-700
              checked:bg-zinc-900 checked:border-zinc-900 dark:checked:bg-zinc-100 dark:checked:border-zinc-100
              ${error ? "border-red-500 checked:border-red-600" : ""}
              ${className}
            `}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={description ? `${switchId}-desc` : undefined}
            {...props}
          />
          <span className={`
            absolute top-0.5 left-0.5 pointer-events-none block h-4 w-4 rounded-full
            bg-white shadow-sm transition-transform duration-150
            peer-checked:translate-x-4
            dark:bg-zinc-900
          `} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          {label && (
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {label}
              {required && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
            </span>
          )}
          {description && (
            <p id={`${switchId}-desc`} className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
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
Switch.displayName = "Switch";