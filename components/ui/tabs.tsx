"use client";

import * as React from "react";

/**
 * Tabs primitive for view switching, settings categories, and exam views
 *
 * Importers/callers: components/exams/ExamsApp.tsx, components/settings/SettingsView.tsx, components/tasks/TasksApp.tsx
 * Affected API: React Context pattern with controlled/uncontrolled value, orientation, keyboard navigation
 * Data schemas: TabsProps, TabsTriggerProps, TabsContentProps
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Tabs"
 */
export interface TabsProps {
  children: React.ReactNode;
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  value: string;
  disabled?: boolean;
}

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  value: string;
}

const TabsContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
  orientation: "horizontal" | "vertical";
} | null>(null);

export function Tabs({ children, defaultValue, value: controlledValue, onValueChange, orientation = "horizontal", className }: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const handleValueChange = React.useCallback((newValue: string) => {
    if (!isControlled) setUncontrolledValue(newValue);
    onValueChange?.(newValue);
  }, [isControlled, onValueChange]);

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange, orientation }}>
      <div className={className} data-orientation={orientation}>
        {React.Children.map(children, (child) =>
          React.isValidElement(child) ? React.cloneElement(child as React.ReactElement<any>) : child
        )}
      </div>
    </TabsContext.Provider>
  );
}
Tabs.displayName = "Tabs";

export const TabsList: React.FC<TabsListProps> = ({ children, className, ...props }) => {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsList must be used within Tabs");

  return (
    <div
      role="tablist"
      aria-orientation={context.orientation}
      className={`
        inline-flex items-center gap-1 bg-muted p-1 rounded-lg
        ${context.orientation === "vertical" ? "flex-col w-fit" : ""}
        ${className || ""}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ children, value, disabled, className, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    if (!context) throw new Error("TabsTrigger must be used within Tabs");

    const isActive = context.value === value;

    return (
      <button
        ref={ref}
        role="tab"
        aria-selected={isActive}
        aria-controls={`tabs-content-${value}`}
        id={`tabs-trigger-${value}`}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && context.onValueChange(value)}
        className={`
          inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md
          transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          disabled:pointer-events-none disabled:opacity-50
          ${isActive
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}
          ${context.orientation === "vertical" ? "w-full justify-start" : ""}
          ${className || ""}
        `}
        {...props}
      >
        {children}
      </button>
    );
  }
);
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ children, value, className, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    if (!context) throw new Error("TabsContent must be used within Tabs");

    const isActive = context.value === value;

    if (!isActive) return null;

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`tabs-content-${value}`}
        aria-labelledby={`tabs-trigger-${value}`}
        className={`
          mt-4 animate-fade-in
          ${className || ""}
        `}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TabsContent.displayName = "TabsContent";