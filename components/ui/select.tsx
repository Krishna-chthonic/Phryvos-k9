"use client";

import * as React from "react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean | string;
  label?: string;
  helperText?: string;
  placeholder?: string;
  loading?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, label, helperText, placeholder, loading, id, disabled, required, children, ...props }, ref) => {
    const selectId = id || `select-${React.useId()}`;
    const helperId = helperText ? `${selectId}-helper` : undefined;
    const errorId = error ? `${selectId}-error` : undefined;
    const describedBy = [helperId, errorId].filter(Boolean).join(" ") || undefined;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            {label}
            {required && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`
            w-full rounded-lg border px-3 py-2.5 text-sm text-zinc-900 bg-white
            focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-ring
            transition-colors duration-150 appearance-none
            disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed
            dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100
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
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        {error && (
          <p id={errorId} className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
            {typeof error === "string" ? error : "Invalid selection"}
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
Select.displayName = "Select";