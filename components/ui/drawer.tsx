"use client";

import * as React from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

/**
 * Drawer primitive for mobile navigation, artifact drawers, and side panels
 *
 * Importers/callers: components/shell/AppShell.tsx, components/chat/ChatApp.tsx, components/vault/FilesApp.tsx, components/settings/SettingsView.tsx
 * Affected API: React Portal with DrawerContext, side-based animations, body scroll lock, focus restoration
 * Data schemas: DrawerProps, DrawerContentProps
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Drawer"
 */
export interface DrawerProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "left" | "right" | "top" | "bottom";
  size?: "sm" | "md" | "lg" | "full";
  modal?: boolean;
}

export interface DrawerTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export interface DrawerContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export interface DrawerHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export interface DrawerTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export interface DrawerDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export interface DrawerFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export interface DrawerCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const DrawerContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  side: "left" | "right" | "top" | "bottom";
} | null>(null);

const sizeStyles: Record<string, string> = {
  sm: "w-64 sm:w-80",
  md: "w-80 sm:w-96",
  lg: "w-[400px] sm:w-[480px]",
  full: "w-full sm:max-w-2xl",
};

const sideStyles: Record<string, string> = {
  left: "left-0 top-0 h-full",
  right: "right-0 top-0 h-full",
  top: "left-0 top-0 w-full",
  bottom: "left-0 bottom-0 w-full",
};

export function Drawer({ children, open: controlledOpen, onOpenChange, side = "right", size = "md", modal = true }: DrawerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = React.useCallback((value: boolean) => {
    if (!isControlled) setUncontrolledOpen(value);
    onOpenChange?.(value);
  }, [isControlled, onOpenChange]);

  const previousActiveElement = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      previousActiveElement.current?.focus();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (modal && e.target === (e.currentTarget as HTMLElement)) {
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

  const portal = open ? createPortal(
    <DrawerContext.Provider value={{ open, setOpen, side }}>
      <div
        className="fixed inset-0 z-50 flex"
        role="dialog"
        aria-modal={modal}
        onClick={(e) => { if (e.target === e.currentTarget && modal) setOpen(false); }}
      >
        <div className="fixed inset-0 bg-black/50 animate-fade-in" aria-hidden="true" />
        <div
          className={`
            bg-card text-card-foreground border border-border shadow-xl flex flex-col
            animate-slide-in-${side === "left" ? "left" : side === "right" ? "right" : side === "top" ? "down" : "up"}
            ${sideStyles[side]} ${sizeStyles[size]}
          `}
        >
          {React.Children.map(children, (child) =>
            React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<any>) : child
          )}
        </div>
      </div>
    </DrawerContext.Provider>,
    document.body
  ) : null;

  return <>{portal}</>;
}
Drawer.displayName = "Drawer";

export const DrawerTrigger = React.forwardRef<HTMLButtonElement, DrawerTriggerProps>(
  ({ children, className, ...props }, ref) => {
    const context = React.useContext(DrawerContext);
    if (!context) throw new Error("DrawerTrigger must be used within Drawer");

    return (
      <button
        ref={ref}
        type="button"
        className={className}
        onClick={() => context.setOpen(!context.open)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
DrawerTrigger.displayName = "DrawerTrigger";

export const DrawerContent = React.forwardRef<HTMLDivElement, DrawerContentProps>(
  ({ children, className, title, description, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          flex flex-col h-full overflow-hidden
          ${className}
        `}
        {...props}
      >
        {(title || description) && (
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              {title && <h2 className="text-lg font-semibold">{title}</h2>}
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
        )}
        <div className="flex-1 overflow-auto p-4">
          {children}
        </div>
      </div>
    );
  }
);
DrawerContent.displayName = "DrawerContent";

export const DrawerHeader: React.FC<DrawerHeaderProps> = ({ children, className, ...props }) => (
  <div className={`flex items-center justify-between p-4 border-b ${className || ""}`} {...props}>
    {children}
  </div>
);

export const DrawerTitle: React.FC<DrawerTitleProps> = ({ children, className, ...props }) => (
  <h2 className={`text-lg font-semibold ${className || ""}`} {...props}>
    {children}
  </h2>
);

export const DrawerDescription: React.FC<DrawerDescriptionProps> = ({ children, className, ...props }) => (
  <p className={`text-sm text-muted-foreground ${className || ""}`} {...props}>
    {children}
  </p>
);

export const DrawerFooter: React.FC<DrawerFooterProps> = ({ children, className, ...props }) => (
  <div className={`flex items-center justify-end gap-2 p-4 border-t ${className || ""}`} {...props}>
    {children}
  </div>
);

export const DrawerClose = React.forwardRef<HTMLButtonElement, DrawerCloseProps>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(DrawerContext);
    return (
      <button
        ref={ref}
        type="button"
        className={`
          absolute right-4 top-4 rounded-lg p-1 text-muted-foreground
          hover:bg-accent hover:text-accent-foreground
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          disabled:pointer-events-none disabled:opacity-50
          ${className}
        `}
        onClick={() => context?.setOpen(false)}
        aria-label="Close"
        {...props}
      >
        {children || <X className="h-4 w-4" />}
      </button>
    );
  }
);
DrawerClose.displayName = "DrawerClose";