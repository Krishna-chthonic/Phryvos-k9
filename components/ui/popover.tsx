"use client";

import * as React from "react";

/**
 * Popover primitive for contextual menus, date pickers, and action menus
 *
 * Importers/callers: components/shell/CommandPalette.tsx, components/chat/ChatComposer.tsx, components/vault/FileTree.tsx, components/settings/ProviderSettings.tsx
 * Affected API: React Context pattern with trigger/content components, positioning logic, focus management
 * Data schemas: PopoverProps, PopoverTriggerProps, PopoverContentProps
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Popover"
 */
export interface PopoverProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
}

export interface PopoverTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

const PopoverContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  modal?: boolean;
} | null>(null);

export function Popover({ children, open: controlledOpen, onOpenChange, modal = false }: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = React.useCallback((value: boolean) => {
    if (!isControlled) setUncontrolledOpen(value);
    onOpenChange?.(value);
  }, [isControlled, onOpenChange]);

  const triggerRef = React.useRef<HTMLElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      if (modal) document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, modal, setOpen]);

  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef, contentRef, modal }}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<any>) : child
      )}
    </PopoverContext.Provider>
  );
}
Popover.displayName = "Popover";

export const PopoverTrigger = React.forwardRef<HTMLButtonElement, PopoverTriggerProps>(
  ({ children, className, ...props }, ref) => {
    const context = React.useContext(PopoverContext);
    if (!context) throw new Error("PopoverTrigger must be used within Popover");

    return (
      <button
        ref={(el) => { (context.triggerRef as any).current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as any).current = el; }}
        type="button"
        className={className}
        onClick={() => context.setOpen(!context.open)}
        aria-expanded={context.open}
        aria-haspopup="dialog"
        {...props}
      >
        {children}
      </button>
    );
  }
);
PopoverTrigger.displayName = "PopoverTrigger";

export const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ children, className, side = "bottom", align = "center", sideOffset = 8, ...props }, ref) => {
    const context = React.useContext(PopoverContext);
    if (!context) throw new Error("PopoverContent must be used within Popover");
    if (!context.open) return null;

    const [position, setPosition] = React.useState({ x: 0, y: 0 });

    React.useEffect(() => {
      const updatePosition = () => {
        if (!context.triggerRef.current || !context.contentRef.current) return;
        const triggerRect = context.triggerRef.current.getBoundingClientRect();
        const contentRect = context.contentRef.current.getBoundingClientRect();
        let x = 0, y = 0;

        switch (side) {
          case "top":
            x = triggerRect.left + triggerRect.width / 2 - contentRect.width / 2;
            y = triggerRect.top - contentRect.height - sideOffset;
            break;
          case "bottom":
            x = triggerRect.left + triggerRect.width / 2 - contentRect.width / 2;
            y = triggerRect.bottom + sideOffset;
            break;
          case "left":
            x = triggerRect.left - contentRect.width - sideOffset;
            y = triggerRect.top + triggerRect.height / 2 - contentRect.height / 2;
            break;
          case "right":
            x = triggerRect.right + sideOffset;
            y = triggerRect.top + triggerRect.height / 2 - contentRect.height / 2;
            break;
        }

        if (align === "start") {
          if (side === "top" || side === "bottom") x = triggerRect.left;
          else y = triggerRect.top;
        } else if (align === "end") {
          if (side === "top" || side === "bottom") x = triggerRect.right - contentRect.width;
          else y = triggerRect.bottom - contentRect.height;
        }

        setPosition({ x, y });
      };
      updatePosition();
      window.addEventListener("resize", updatePosition);
      window.addEventListener("scroll", updatePosition, true);
      return () => {
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("scroll", updatePosition, true);
      };
    }, [context.triggerRef.current, context.contentRef.current, side, align, sideOffset]);

    return (
      <div
        ref={(el) => { (context.contentRef as any).current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as any).current = el; }}
        style={{
          position: "fixed",
          left: position.x,
          top: position.y,
          zIndex: 50,
        }}
        className={`
          bg-popover text-popover-foreground border border-border rounded-lg shadow-lg p-3
          min-w-[200px] max-w-[400px] animate-zoom-in-95
          ${className}
        `}
        role="dialog"
        aria-modal={context.modal ?? false}
        {...props}
      >
        {children}
      </div>
    );
  }
);
PopoverContent.displayName = "PopoverContent";