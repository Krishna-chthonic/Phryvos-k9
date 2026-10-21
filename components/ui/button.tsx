"use client";

import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "ghost"
    | "danger"
    | "destructive"
    | "success"
    | "warning"
    | "outline"
    | "link";
  size?: "sm" | "md" | "lg" | "xl" | "icon" | "iconSm" | "iconLg";
  fullWidth?: boolean;
  loading?: boolean;
}

const baseStyles =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-120 select-none disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed";

const variantStyles: Record<string, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent)] shadow-none rounded-[var(--radius-sm)]",
  secondary:
    "bg-[var(--bg-2)] text-[var(--fg-0)] border border-[var(--border)] hover:bg-[var(--bg-3)] active:bg-[var(--bg-3)] rounded-[var(--radius-sm)]",
  ghost:
    "bg-transparent text-[var(--fg-1)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] active:bg-[var(--bg-3)] rounded-[var(--radius-sm)]",
  danger:
    "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30 hover:bg-[var(--danger)] hover:text-white rounded-[var(--radius-sm)]",
  destructive:
    "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30 hover:bg-[var(--danger)] hover:text-white rounded-[var(--radius-sm)]",
  success:
    "bg-[var(--bg-2)] text-[var(--success)] border border-[var(--success)]/30 hover:bg-[var(--success)] hover:text-white rounded-[var(--radius-sm)]",
  warning:
    "bg-[var(--bg-2)] text-[var(--warning)] border border-[var(--warning)]/30 hover:bg-[var(--warning)] hover:text-white rounded-[var(--radius-sm)]",
  outline:
    "border border-[var(--border)] bg-transparent text-[var(--fg-0)] hover:bg-[var(--bg-2)] rounded-[var(--radius-sm)]",
  link:
    "bg-transparent text-[var(--accent)] hover:underline p-0 h-auto",
};

const sizeStyles: Record<string, string> = {
  sm: "h-[28px] px-2.5 text-[11px]",
  md: "h-[32px] px-3.5 text-[13px]",
  lg: "h-[40px] px-4.5 text-[14px]",
  xl: "h-[40px] px-6 text-[14px]",
  icon: "h-[32px] w-[32px] p-0 shrink-0",
  iconSm: "h-[28px] w-[28px] p-0 shrink-0",
  iconLg: "h-[40px] w-[40px] p-0 shrink-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      variant = "primary",
      size = "md",
      fullWidth = false,
      loading = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const variantClass = variantStyles[variant] || variantStyles.primary;
    const sizeClass = sizeStyles[size] || sizeStyles.md;
    const widthClass = fullWidth ? "w-full" : "";

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        aria-disabled={disabled || loading}
        className={`${baseStyles} ${variantClass} ${sizeClass} ${widthClass} ${className}`}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="h-[14px] w-[14px] animate-spin shrink-0 text-current opacity-80"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-90"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="opacity-60 truncate">{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
