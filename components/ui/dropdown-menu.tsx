"use client";

import * as React from "react";
import { Check, ChevronRight } from "lucide-react";

/**
 * DropdownMenu primitive for contextual actions, file actions, and message actions
 *
 * Importers/callers: components/chat/ChatMessage.tsx, components/vault/FileTree.tsx, components/shell/AppShell.tsx
 * Affected API: React Context pattern with trigger, content, items, submenus, keyboard navigation
 * Data schemas: DropdownMenuProps, DropdownMenuItemProps, DropdownMenuCheckboxItemProps, DropdownMenuRadioItemProps
 * User instruction verbatim: "Phase 6: Core component library (primitives) - DropdownMenu"
 */
export interface DropdownMenuProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface DropdownMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

export interface DropdownMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  inset?: boolean;
}

export interface DropdownMenuCheckboxItemProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: React.ReactNode;
  checked?: boolean;
  shortcut?: string;
  disabled?: boolean;
  inset?: boolean;
}

export interface DropdownMenuRadioItemProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: React.ReactNode;
  checked?: boolean;
  shortcut?: string;
  disabled?: boolean;
  inset?: boolean;
}

export interface DropdownMenuSeparatorProps extends React.HTMLAttributes<HTMLHRElement> {}

export interface DropdownMenuLabelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  inset?: boolean;
}

export interface DropdownMenuGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export interface DropdownMenuSubTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  disabled?: boolean;
  inset?: boolean;
}

export interface DropdownMenuSubContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const DropdownMenuContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
} | null>(null);

const DropdownMenuSubContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
} | null>(null);

export function DropdownMenu({ children, open: controlledOpen, onOpenChange }: DropdownMenuProps) {
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
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, setOpen]);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef, contentRef }}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<any>) : child
      )}
    </DropdownMenuContext.Provider>
  );
}
DropdownMenu.displayName = "DropdownMenu";

export const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, DropdownMenuTriggerProps>(
  ({ children, className, ...props }, ref) => {
    const context = React.useContext(DropdownMenuContext);
    if (!context) throw new Error("DropdownMenuTrigger must be used within DropdownMenu");

    return (
      <button
        ref={(el) => { (context.triggerRef as any).current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as any).current = el; }}
        type="button"
        className={className}
        onClick={() => context.setOpen(!context.open)}
        aria-expanded={context.open}
        aria-haspopup="menu"
        {...props}
      >
        {children}
      </button>
    );
  }
);
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

export const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ children, className, side = "bottom", align = "start", sideOffset = 4, ...props }, ref) => {
    const context = React.useContext(DropdownMenuContext);
    if (!context) throw new Error("DropdownMenuContent must be used within DropdownMenu");
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
          bg-popover text-popover-foreground border border-border rounded-lg shadow-lg p-1
          min-w-[180px] max-w-[320px] animate-zoom-in-95
          ${className}
        `}
        role="menu"
        {...props}
      >
        {children}
      </div>
    );
  }
);
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<HTMLButtonElement, DropdownMenuItemProps>(
  ({ children, className, shortcut, disabled, inset, onClick, ...props }, ref) => {
    const context = React.useContext(DropdownMenuContext);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      onClick?.(e);
      context?.setOpen(false);
    };

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className={`
          flex w-full items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md
          hover:bg-zinc-100 dark:hover:bg-zinc-800
          focus-visible:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground
          disabled:pointer-events-none disabled:opacity-50
          ${inset ? "pl-8" : ""}
          ${className}
        `}
        role="menuitem"
        {...props}
      >
        <span className="flex-1 text-left">{children}</span>
        {shortcut && <span className="text-xs text-muted-foreground font-normal">{shortcut}</span>}
      </button>
    );
  }
);
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuCheckboxItem = React.forwardRef<HTMLButtonElement, DropdownMenuCheckboxItemProps>(
  ({ children, className, checked, shortcut, disabled, inset, onClick, ...props }, ref) => {
    const context = React.useContext(DropdownMenuContext);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      onClick?.(e);
      context?.setOpen(false);
    };

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className={`
          flex w-full items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md
          hover:bg-zinc-100 dark:hover:bg-zinc-800
          focus-visible:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground
          disabled:pointer-events-none disabled:opacity-50
          ${inset ? "pl-8" : ""}
          ${className}
        `}
        role="menuitemcheckbox"
        aria-checked={checked}
        {...props}
      >
        <span className="flex h-4 w-4 items-center justify-center">
          {checked && <Check className="h-3 w-3" />}
        </span>
        <span className="flex-1 text-left">{children}</span>
        {shortcut && <span className="text-xs text-muted-foreground font-normal">{shortcut}</span>}
      </button>
    );
  }
);
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

export const DropdownMenuRadioItem = React.forwardRef<HTMLButtonElement, DropdownMenuRadioItemProps>(
  ({ children, className, checked, shortcut, disabled, inset, onClick, ...props }, ref) => {
    const context = React.useContext(DropdownMenuContext);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      onClick?.(e);
      context?.setOpen(false);
    };

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className={`
          flex w-full items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md
          hover:bg-zinc-100 dark:hover:bg-zinc-800
          focus-visible:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground
          disabled:pointer-events-none disabled:opacity-50
          ${inset ? "pl-8" : ""}
          ${className}
        `}
        role="menuitemradio"
        aria-checked={checked}
        {...props}
      >
        <span className="flex h-4 w-4 items-center justify-center">
          {checked && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
        </span>
        <span className="flex-1 text-left">{children}</span>
        {shortcut && <span className="text-xs text-muted-foreground font-normal">{shortcut}</span>}
      </button>
    );
  }
);
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

export const DropdownMenuSeparator: React.FC<DropdownMenuSeparatorProps> = ({ className, ...props }) => (
  <hr className={`h-px bg-border my-1 ${className || ""}`} role="separator" {...props} />
);

export const DropdownMenuLabel: React.FC<DropdownMenuLabelProps> = ({ children, className, inset, ...props }) => (
  <div className={`
    px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider
    ${inset ? "pl-8" : ""}
    ${className || ""}
  `} {...props}>
    {children}
  </div>
);

export const DropdownMenuGroup: React.FC<DropdownMenuGroupProps> = ({ children, className, ...props }) => (
  <div className={className} role="group" {...props}>
    {children}
  </div>
);

export const DropdownMenuSubTrigger = React.forwardRef<HTMLButtonElement, DropdownMenuSubTriggerProps>(
  ({ children, className, disabled, inset, ...props }, ref) => {
    const subContext = React.useContext(DropdownMenuSubContext);
    if (!subContext) throw new Error("DropdownMenuSubTrigger must be used within DropdownMenuSub");

    return (
      <button
        ref={(el) => { (subContext.triggerRef as any).current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as any).current = el; }}
        type="button"
        disabled={disabled}
        className={`
          flex w-full items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md
          hover:bg-zinc-100 dark:hover:bg-zinc-800
          focus-visible:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground
          disabled:pointer-events-none disabled:opacity-50
          ${inset ? "pl-8" : ""}
          ${className}
        `}
        aria-haspopup="menu"
        aria-expanded={subContext.open}
        {...props}
      >
        <span className="flex-1 text-left">{children}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  }
);
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

export const DropdownMenuSubContent = React.forwardRef<HTMLDivElement, DropdownMenuSubContentProps>(
  ({ children, className, ...props }, ref) => {
    const subContext = React.useContext(DropdownMenuSubContext);
    if (!subContext) throw new Error("DropdownMenuSubContent must be used within DropdownMenuSub");

    return (
      <div
        ref={(el) => { if (ref) (ref as any).current = el; }}
        style={{
          position: "absolute",
          left: "100%",
          top: 0,
          zIndex: 50,
        }}
        className={`
          bg-popover text-popover-foreground border border-border rounded-lg shadow-lg p-1
          min-w-[180px] max-w-[320px] animate-zoom-in-95
          ${className || ""}
        `}
        role="menu"
        {...props}
      >
        {children}
      </div>
    );
  }
);
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";

export function DropdownMenuSub({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement>(null);

  return (
    <DropdownMenuSubContext.Provider value={{ open, setOpen, triggerRef }}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<any>) : child
      )}
    </DropdownMenuSubContext.Provider>
  );
}
DropdownMenuSub.displayName = "DropdownMenuSub";