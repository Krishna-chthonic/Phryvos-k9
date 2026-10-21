"use client";

import * as React from "react";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function Kbd({ className = "", children, ...props }: KbdProps) {
  return (
    <kbd
      className={`inline-flex items-center justify-center font-mono text-[10px] font-medium text-[var(--fg-1)] bg-[var(--bg-2)] border border-[var(--border-subtle)] rounded-[var(--radius-xs)] px-1.5 py-0.5 shadow-none select-none ${className}`}
      {...props}
    >
      {children}
    </kbd>
  );
}
