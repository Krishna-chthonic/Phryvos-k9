"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        className:
          "!bg-[var(--bg-2)] !text-[var(--fg-0)] !border !border-[var(--border)] !rounded-[var(--radius-md)] !text-[var(--text-base)] !shadow-[var(--shadow-popover)]",
        duration: 4000,
      }}
    />
  );
}

export { toast } from "sonner";
