"use client";

import * as React from "react";

/**
 * RadioGroup primitive for mutually exclusive options
 *
 * Importers/callers: components/settings/ProviderSettings.tsx, components/exams/ExamSettings.tsx
 * Affected API: HTMLFieldSetElement + Radio inputs with React Context pattern
 * Data schemas: RadioGroupProps, RadioGroupItemProps
 * User instruction verbatim: "Phase 6: Core component library (primitives) - RadioGroup"
 */
export interface RadioGroupProps extends React.FieldsetHTMLAttributes<HTMLFieldSetElement> {
  value?: string;
  onValueChange?: (value: string) => void;
  label?: string;
  description?: string;
  error?: boolean | string;
  orientation?: "horizontal" | "vertical";
}

export interface RadioGroupItemProps extends React.HTMLAttributes<HTMLInputElement> {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  groupId?: string;
}

const RadioGroupContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
} | null>(null);

export function RadioGroup({
  className,
  value,
  onValueChange,
  label,
  description,
  error,
  orientation = "vertical",
  children,
  disabled,
  id,
  ...props
}: RadioGroupProps) {
  const groupId = id || `radiogroup-${React.useId()}`;

  return (
    <RadioGroupContext.Provider value={{ value, onValueChange, disabled }}>
      <fieldset
        className={`gap-3 ${orientation === "horizontal" ? "flex flex-wrap" : "space-y-3"} ${className}`}
        id={groupId}
        aria-invalid={Boolean(error)}
        aria-describedby={description ? `${groupId}-desc` : error ? `${groupId}-error` : undefined}
        disabled={disabled}
        {...props}
      >
        {label && (
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {label}
          </legend>
        )}
        {description && (
          <p id={`${groupId}-desc`} className="text-sm text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        )}
        {React.Children.map(children, (child) =>
          React.isValidElement(child) && React.cloneElement(child as React.ReactElement<any>, {
            groupId,
          }))
        }
        {error && (
          <p id={`${groupId}-error`} className="text-sm text-red-600 dark:text-red-400" role="alert">
            {typeof error === "string" ? error : "Invalid selection"}
          </p>
        )}
      </fieldset>
    </RadioGroupContext.Provider>
  );
}
RadioGroup.displayName = "RadioGroup";

export const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, label, description, disabled, groupId, ...props }, ref) => {
    const context = React.useContext(RadioGroupContext);
    const itemId = `${groupId || "radiogroup"}-${value}`;
    const isSelected = context?.value === value;
    const isDisabled = disabled || context?.disabled;

    return (
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          ref={ref}
          type="radio"
          id={itemId}
          name={groupId}
          value={value}
          checked={isSelected}
          onChange={() => context?.onValueChange?.(value)}
          disabled={isDisabled}
          className={`
            h-4 w-4 appearance-none cursor-pointer
            border-2 border-zinc-300 dark:border-zinc-700
            checked:border-zinc-900 checked:bg-zinc-900 dark:checked:border-zinc-100 dark:checked:bg-zinc-100
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
            disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
          `}
          aria-describedby={description ? `${itemId}-desc` : undefined}
          {...props}
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
          {description && (
            <p id={`${itemId}-desc`} className="text-xs text-zinc-500 dark:text-zinc-400">
              {description}
            </p>
          )}
        </div>
      </label>
    );
  }
);
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroupContext };