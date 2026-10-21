"use client";

import * as React from "react";
import { Search } from "lucide-react";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  sizeVariant?: "sm" | "md";
  error?: boolean;
  isSearch?: boolean;
  trailingKbd?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className = "",
      sizeVariant = "md",
      error = false,
      isSearch = false,
      trailingKbd,
      type = "text",
      ...props
    },
    ref
  ) => {
    const heightClass = sizeVariant === "sm" ? "h-[32px] text-[12px]" : "h-[36px] text-[13px]";
    const paddingClass = isSearch
      ? trailingKbd
        ? "pl-9 pr-14"
        : "pl-9 pr-3"
      : trailingKbd
      ? "pl-3 pr-14"
      : "px-3";

    return (
      <div className="relative w-full flex items-center">
        {isSearch && (
          <Search className="absolute left-2.5 h-4 w-4 text-[var(--fg-2)] pointer-events-none stroke-[1.5]" />
        )}
        <input
          ref={ref}
          type={type}
          className={`w-full rounded-[var(--radius-sm)] bg-[var(--bg-1)] border text-[var(--fg-0)] placeholder:text-[var(--fg-2)] transition-colors duration-120 outline-none select-text ${heightClass} ${paddingClass} ${
            error
              ? "border-[var(--danger)] focus:shadow-[0_0_0_3px_var(--danger-soft)]"
              : "border-[var(--border)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          } ${className}`}
          {...props}
        />
        {trailingKbd && (
          <span className="absolute right-2 px-1.5 py-0.5 text-[10px] font-mono font-medium text-[var(--fg-2)] bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)] pointer-events-none select-none">
            {trailingKbd}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
