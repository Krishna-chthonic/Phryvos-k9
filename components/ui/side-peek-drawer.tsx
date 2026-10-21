"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export interface SidePeekDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: string;
}

export function SidePeekDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = "480px",
}: SidePeekDrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-none transition-opacity duration-160 ease-out data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <DialogPrimitive.Content
          style={{ width: `min(${width}, 100vw)` }}
          className="fixed top-0 right-0 z-50 h-full bg-[var(--bg-1)] border-l border-[var(--border-subtle)] shadow-[var(--shadow-dialog)] flex flex-col focus:outline-none transition-transform duration-200 ease-out data-[state=closed]:translate-x-full data-[state=open]:translate-x-0"
        >
          {/* Header */}
          <div className="flex items-center justify-between h-[56px] px-6 border-b border-[var(--border-subtle)] shrink-0">
            <div>
              <DialogPrimitive.Title className="text-[var(--text-lg)] font-semibold text-[var(--fg-0)]">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-[var(--text-xs)] text-[var(--fg-2)] mt-0.5">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="p-1.5 rounded-[var(--radius-sm)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] transition-colors outline-none focus:shadow-[0_0_0_2px_var(--accent-soft)]">
              <X className="h-4 w-4 stroke-[1.5]" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
