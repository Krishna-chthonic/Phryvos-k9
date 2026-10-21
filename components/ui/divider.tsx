"use client";

import * as React from "react";

export interface DividerProps extends React.HTMLAttributes<HTMLHRElement> {
  inset?: boolean;
}

export function Divider({ className = "", inset = false, ...props }: DividerProps) {
  return (
    <hr
      className={`border-0 border-t border-[var(--border-subtle)] my-0 ${
        inset ? "mx-3" : "w-full"
      } ${className}`}
      {...props}
    />
  );
}
