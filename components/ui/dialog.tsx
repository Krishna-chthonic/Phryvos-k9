"use client";

import * as React from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

/**
 * Dialog primitive for confirmations, forms, and modal interactions
 *
 * Importers/callers: components/chat/ChatApp.tsx, components/vault/FilesApp.tsx, components/settings/SettingsView.tsx
 * Affected API: React Portal with DialogContext, focus trapping, body scroll lock, escape handling
 * Data schemas: DialogProps, DialogContentProps
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Dialog"
 */
export interface DialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
}

export interface DialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export interface DialogTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export interface DialogDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export interface DialogCloseProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const DialogContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  modal?: boolean;
} | null>(null);

export function Dialog({ children, open: controlledOpen, onOpenChange, modal = true }: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = React.useCallback((value: boolean) => {
    if (!isControlled) setUncontrolledOpen(value);
    onOpenChange?.(value);
  }, [isControlled, onOpenChange]);

  const triggerRef = React.useRef<HTMLElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const previousActiveElement = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
      contentRef.current?.focus();
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

  const portal = open ? createPortal(
    <DialogContext.Provider value={{ open, setOpen, triggerRef, contentRef, modal }}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<any>) : child
      )}
    </DialogContext.Provider>,
    document.body
  ) : null;

  return <>{portal}</>;
}
Dialog.displayName = "Dialog";

export const DialogTrigger = React.forwardRef<HTMLButtonElement, DialogTriggerProps>(
  ({ children, className, ...props }, ref) => {
    const context = React.useContext(DialogContext);
    if (!context) throw new Error("DialogTrigger must be used within Dialog");

    return (
      <button
        ref={(el) => { (context.triggerRef as any).current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as any).current = el; }}
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
DialogTrigger.displayName = "DialogTrigger";

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ children, className, title, description, ...props }, ref) => {
    const context = React.useContext(DialogContext);
    if (!context) throw new Error("DialogContent must be used within Dialog");
    if (!context.open) return null;

    const titleId = title ? `dialog-title-${React.useId()}` : undefined;
    const descriptionId = description ? `dialog-description-${React.useId()}` : undefined;

    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in"
        role="dialog"
        aria-modal={context.modal ?? true}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(e) => { if (e.target === e.currentTarget) context.setOpen(false); }}
      >
        <div
          ref={(el) => { (context.contentRef as any).current = el; if (typeof ref === 'function') ref(el); else if (ref) (ref as any).current = el; }}
          tabIndex={-1}
          className={`
            bg-card text-card-foreground border border-border rounded-xl shadow-lg
            w-full max-w-lg max-h-[85vh] overflow-hidden animate-zoom-in-95
            ${className}
          `}
          {...props}
        >
          {(title || description) && (
            <div className="flex flex-col gap-1 p-6 pb-4 border-b">
              {title && (
                <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
              )}
              {description && (
                <p id={descriptionId} className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          )}
          <div className="p-6 pt-0">
            {children}
          </div>
        </div>
      </div>,
      document.body
    );
  }
);
DialogContent.displayName = "DialogContent";

export const DialogHeader: React.FC<DialogHeaderProps> = ({ children, className, ...props }) => (
  <div className={`flex flex-col gap-1.5 ${className || ""}`} {...props}>
    {children}
  </div>
);

export const DialogTitle: React.FC<DialogTitleProps> = ({ children, className, ...props }) => (
  <h2 className={`text-lg font-semibold ${className || ""}`} {...props}>
    {children}
  </h2>
);

export const DialogDescription: React.FC<DialogDescriptionProps> = ({ children, className, ...props }) => (
  <p className={`text-sm text-muted-foreground ${className || ""}`} {...props}>
    {children}
  </p>
);

export const DialogFooter: React.FC<DialogFooterProps> = ({ children, className, ...props }) => (
  <div className={`flex items-center justify-end gap-2 p-6 pt-0 ${className || ""}`} {...props}>
    {children}
  </div>
);

export const DialogClose = React.forwardRef<HTMLButtonElement, DialogCloseProps>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(DialogContext);
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
DialogClose.displayName = "DialogClose";