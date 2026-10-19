"use client";

import * as React from "react";

/**
 * Slider primitive for numeric input ranges with multi-thumb support
 *
 * Importers/callers: components/settings/ProviderSettings.tsx, components/exams/EffortSelector.tsx, components/shell/TimeTravelScrubber.tsx
 * Affected API: HTMLInputElement type="range" with multi-thumb keyboard support
 * Data schemas: SliderProps with value[], min, max, step, onValueChange
 * User instruction verbatim: "Phase 6: Core component library (primitives) - Slider"
 */
export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value"> {
  label?: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number[];
  onValueChange?: (value: number[]) => void;
  error?: boolean | string;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, label, description, min = 0, max = 100, step = 1, value = [0], onValueChange, error, id, disabled, required, ...props }, ref) => {
    const sliderId = id || `slider-${React.useId()}`;
    const isMulti = value.length > 1;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = Number(e.target.value);
      const index = Number(e.target.dataset.index || 0);
      const newValues = value.map((v, i) => (i === index ? newValue : v));
      onValueChange?.(newValues);
    };

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={sliderId} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            {label}
            {required && <span className="text-destructive ml-1" aria-hidden="true">*</span>}
          </label>
        )}
        <div className="relative" role="group" aria-labelledby={label ? sliderId : undefined}>
          <input
            ref={ref}
            type="range"
            id={sliderId}
            min={min}
            max={max}
            step={step}
            value={value[0]}
            onChange={handleChange}
            data-index={0}
            className={`
              w-full h-2 appearance-none bg-transparent cursor-pointer
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
              disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed
              ${className}
            `}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value[0]}
            {...props}
          />
          <div className="absolute inset-0 flex items-center pointer-events-none">
            <div className={`
              w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800
              ${error ? "bg-red-200 dark:bg-red-900/30" : ""}
            `}>
              <div className={`
                h-full rounded-full bg-zinc-900 dark:bg-zinc-100
                ${error ? "bg-red-500 dark:bg-red-400" : ""}
              `} style={{ width: `${((value[0] - min) / (max - min)) * 100}%` }} />
            </div>
          </div>
          <div className="absolute inset-0 flex items-center justify-between pointer-events-none">
            {value.map((v, i) => (
              <div
                key={i}
                className={`
                  h-4 w-4 rounded-full border-2 border-white shadow-sm
                  bg-zinc-900 dark:bg-zinc-100
                  transform -translate-x-1/2
                  transition-transform duration-150
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                  ${error ? "bg-red-500 border-red-500" : ""}
                `}
                style={{ left: `${((v - min) / (max - min)) * 100}%` }}
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={v}
                aria-orientation="horizontal"
                onKeyDown={(e) => {
                  let newV = v;
                  if (e.key === "ArrowRight" || e.key === "ArrowUp") newV = Math.min(v + step, max);
                  if (e.key === "ArrowLeft" || e.key === "ArrowDown") newV = Math.max(v - step, min);
                  if (newV !== v) {
                    const newValues = value.map((val, idx) => (idx === i ? newV : val));
                    onValueChange?.(newValues);
                  }
                }}
              />
            ))}
          </div>
        </div>
        {description && (
          <p id={`${sliderId}-desc`} className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        )}
        {error && (
          <p className="mt-1.5 text-xs text-red-600 dark:text-red-400" role="alert">
            {typeof error === "string" ? error : "Invalid value"}
          </p>
        )}
      </div>
    );
  }
);
Slider.displayName = "Slider";