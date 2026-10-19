"use client";

/**
 * Scrubbable Math — "Bret Victor Style" interactive numeric variables
 * Drag values horizontally to see formulas recalculate and inline SVG trajectories morph at 60 FPS
 *
 * Importers: app/(app)/exams/page.tsx (ExamsPage), components/exams/ExamsApp.tsx
 * Affected API: None new - client-side only reactive math
 * Data schemas: None - purely client-side calculation
 * User instruction: Continue Phase 3 implementation - Scrubbable reactive equations
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Minus, Plus, SlidersHorizontal, Calculator, Copy, Check } from "lucide-react";

export interface ScrubbableVariable {
  id: string;
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  label?: string;
}

export interface ScrubbableFormula {
  id: string;
  name: string;
  expression: string; // e.g., "0.5 * m * v^2" or "m * g * h"
  variables: string[]; // variable ids this formula depends on
  unit?: string;
  description?: string;
}

export interface ScrubbableMathProps {
  variables: ScrubbableVariable[];
  formulas: ScrubbableFormula[];
  className?: string;
  onVariableChange?: (id: string, value: number) => void;
  showTrajectory?: boolean;
}

type MathScope = Record<string, number>;

function evaluateExpression(expr: string, scope: MathScope): number {
  // Safe expression evaluation - replace variable names with values
  let processed = expr;

  // Replace ^ with ** for exponentiation
  processed = processed.replace(/\^/g, "**");

  // Replace variable names with values
  for (const [name, value] of Object.entries(scope)) {
    const regex = new RegExp(`\\b${name}\\b`, "g");
    processed = processed.replace(regex, String(value));
  }

  // Replace common math constants
  processed = processed.replace(/\bpi\b/gi, String(Math.PI));
  processed = processed.replace(/\be\b/gi, String(Math.E));

  // Safe eval using Function constructor (still risky but better than eval)
  // For production, use a proper math parser like mathjs
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(scope), `return ${processed}`);
    return fn(...Object.values(scope));
  } catch {
    return NaN;
  }
}

function parseExpression(expr: string): string[] {
  // Extract variable names from expression (simple regex approach)
  const vars = expr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
  return [...new Set(vars.filter(v => !["pi", "e", "Math"].includes(v)))];
}

export function ScrubbableMath({
  variables: initialVariables,
  formulas: initialFormulas,
  className,
  onVariableChange,
  showTrajectory = true
}: ScrubbableMathProps) {
  const [variables, setVariables] = useState<ScrubbableVariable[]>(initialVariables);
  const [formulas] = useState<ScrubbableFormula[]>(initialFormulas);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; value: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute all formula values
  const scope = useMemo(() => {
    const s: MathScope = {};
    variables.forEach(v => { s[v.name] = v.value; });
    return s;
  }, [variables]);

  const formulaResults = useMemo(() => {
    return formulas.map(f => ({
      ...f,
      value: evaluateExpression(f.expression, scope),
      variables: parseExpression(f.expression),
    }));
  }, [formulas, scope]);

  // Trajectory data for plotting (last 50 values per variable)
  const [trajectories, setTrajectories] = useState<Record<string, number[]>>({});

  useEffect(() => {
    setTrajectories(prev => {
      const next = { ...prev };
      variables.forEach(v => {
        if (!next[v.id]) next[v.id] = [];
        next[v.id].push(v.value);
        if (next[v.id].length > 50) next[v.id].shift();
      });
      return next;
    });
  }, [variables]);

  const handleMouseDown = useCallback((e: React.MouseEvent, variable: ScrubbableVariable) => {
    e.preventDefault();
    setDraggingId(variable.id);
    setDragStart({ x: e.clientX, value: variable.value });
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingId || !dragStart) return;

    const deltaX = e.clientX - dragStart.x;
    const variable = variables.find(v => v.id === draggingId);
    if (!variable) return;

    // Sensitivity: 1 unit per 10px drag
    const sensitivity = variable.step * 0.1;
    let newValue = dragStart.value + deltaX * sensitivity;

    // Clamp to min/max
    newValue = Math.max(variable.min, Math.min(variable.max, newValue));

    // Snap to step
    newValue = Math.round(newValue / variable.step) * variable.step;

    setVariables(prev => prev.map(v =>
      v.id === draggingId ? { ...v, value: newValue } : v
    ));

    onVariableChange?.(draggingId, newValue);
  }, [draggingId, dragStart, variables, onVariableChange]);

  const handleMouseUp = useCallback(() => {
    setDraggingId(null);
    setDragStart(null);
  }, []);

  useEffect(() => {
    if (draggingId) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [draggingId, handleMouseMove, handleMouseUp]);

  const handleIncrement = (id: string) => {
    setVariables(prev => prev.map(v => {
      if (v.id === id) {
        const newValue = Math.min(v.max, v.value + v.step);
        onVariableChange?.(id, newValue);
        return { ...v, value: newValue };
      }
      return v;
    }));
  };

  const handleDecrement = (id: string) => {
    setVariables(prev => prev.map(v => {
      if (v.id === id) {
        const newValue = Math.max(v.min, v.value - v.step);
        onVariableChange?.(id, newValue);
        return { ...v, value: newValue };
      }
      return v;
    }));
  };

  const handleDirectInput = (id: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    const variable = variables.find(v => v.id === id);
    if (!variable) return;

    const clamped = Math.max(variable.min, Math.min(variable.max, num));
    setVariables(prev => prev.map(v =>
      v.id === id ? { ...v, value: clamped } : v
    ));
    onVariableChange?.(id, clamped);
  };

  const copyValue = (id: string, value: number) => {
    navigator.clipboard.writeText(String(value));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // SVG trajectory path
  const getTrajectoryPath = (id: string, width: number, height: number) => {
    const data = trajectories[id];
    if (!data || data.length < 2) return "";

    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const range = maxVal - minVal || 1;

    return data.map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - minVal) / range) * height;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  };

  return (
    <div className={cn("bg-neutral-950/80 rounded-lg border border-neutral-800 overflow-hidden", className)}>
      <div className="p-4 border-b border-neutral-800 bg-neutral-900/60">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-200 font-mono flex items-center gap-2">
            <Calculator className="h-4 w-4 text-cyan-400" />
            Scrubbable Math
          </h2>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="flex items-center gap-1">
              <SlidersHorizontal className="h-3 w-3" />
              Drag values to scrub
            </span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Variables Section */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-neutral-300 uppercase tracking-wider">Variables</h3>
          <div className="space-y-3">
            {variables.map((variable) => {
              const isDragging = draggingId === variable.id;
              const trajectory = trajectories[variable.id] || [];

              return (
                <div
                  key={variable.id}
                  className={cn(
                    "rounded-lg p-3 border transition-all relative overflow-hidden",
                    isDragging
                      ? "border-cyan-500/50 bg-cyan-500/10 ring-1 ring-cyan-500/20"
                      : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-700"
                  )}
                >
                  {/* Trajectory sparkline */}
                  {showTrajectory && trajectory.length > 1 && (
                    <svg
                      className="absolute top-2 right-2 opacity-50"
                      width="60"
                      height="20"
                      viewBox="0 0 60 20"
                    >
                      <path
                        d={getTrajectoryPath(variable.id, 60, 20)}
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                        className="text-cyan-400"
                      />
                    </svg>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-neutral-400">{variable.name}</span>
                        {variable.label && (
                          <span className="text-xs text-neutral-500">{variable.label}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDecrement(variable.id)}
                          className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-neutral-200"
                          aria-label="Decrease"
                        >
                          <Minus className="h-4 w-4" />
                        </button>

                        <input
                          type="number"
                          value={variable.value}
                          onChange={(e) => handleDirectInput(variable.id, e.target.value)}
                          onMouseDown={(e) => handleMouseDown(e, variable)}
                          className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm font-mono text-neutral-100 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          step={variable.step}
                          min={variable.min}
                          max={variable.max}
                          style={{ cursor: "ew-resize" }}
                        />

                        <button
                          onClick={() => handleIncrement(variable.id)}
                          className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-neutral-200"
                          aria-label="Increase"
                        >
                          <Plus className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => copyValue(variable.id, variable.value)}
                          className="p-1.5 rounded hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-cyan-400"
                          aria-label="Copy value"
                        >
                          {copiedId === variable.id ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                        </button>

                        {variable.unit && (
                          <span className="text-xs text-neutral-500 font-mono w-12 text-right">{variable.unit}</span>
                        )}
                      </div>

                      {/* Range indicator */}
                      <div className="mt-2 h-1.5 rounded-full bg-neutral-800 relative">
                        <div
                          className="absolute h-1.5 rounded-full bg-cyan-500/50 transition-all duration-100"
                          style={{
                            left: `${((variable.value - variable.min) / (variable.max - variable.min)) * 100}%`,
                            width: `${(variable.step / (variable.max - variable.min)) * 100}%`,
                          }}
                        />
                        <div className="absolute top-full left-0 text-[8px] text-neutral-600 font-mono">
                          {variable.min}
                        </div>
                        <div className="absolute top-full right-0 text-[8px] text-neutral-600 font-mono">
                          {variable.max}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Formulas Section */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-neutral-300 uppercase tracking-wider">Formulas</h3>
          <div className="space-y-3">
            {formulaResults.map((formula) => {
              const isNaN = Number.isNaN(formula.value);
              const usedVars = formula.variables.filter(v =>
                variables.some(item => item.name === v)
              );

              return (
                <div
                  key={formula.id}
                  className="rounded-lg p-3 border border-neutral-800 bg-neutral-900/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-cyan-400">{formula.name}</span>
                        {formula.description && (
                          <span className="text-xs text-neutral-500">{formula.description}</span>
                        )}
                      </div>

                      <div className="text-sm font-mono text-neutral-300 font-light">
                        {formula.expression}
                        {usedVars.length > 0 && (
                          <span className="ml-2 text-xs text-neutral-500">
                            = {isNaN ? "—" : formula.value.toLocaleString(undefined, { maximumFractionDigits: 4 })}{formula.unit ? ` ${formula.unit}` : ""}
                          </span>
                        )}
                      </div>

                      {/* Dependency indicators */}
                      {usedVars.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {usedVars.map(varName => {
                            const variable = variables.find(v => v.name === varName);
                            return variable ? (
                              <span
                                key={varName}
                                className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                              >
                                {varName} = {variable.value}{variable.unit ? ` ${variable.unit}` : ""}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>

                    <div className={cn(
                      "text-right min-w-[120px]",
                      isNaN ? "text-rose-400" : "text-emerald-400"
                    )}>
                      <div className="text-lg font-mono font-medium">
                        {isNaN ? "Error" : formula.value.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </div>
                      {formula.unit && (
                        <div className="text-xs text-neutral-500">{formula.unit}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Preset configurations for common physics problems
export const PHYSICS_PRESETS = {
  projectileMotion: {
    variables: [
      { id: "v0", name: "v₀", value: 20, min: 0, max: 100, step: 1, unit: "m/s", label: "Initial velocity" },
      { id: "theta", name: "θ", value: 45, min: 0, max: 90, step: 1, unit: "°", label: "Launch angle" },
      { id: "g", name: "g", value: 9.81, min: 1, max: 20, step: 0.01, unit: "m/s²", label: "Gravity" },
      { id: "h0", name: "h₀", value: 0, min: 0, max: 100, step: 1, unit: "m", label: "Initial height" },
    ] as ScrubbableVariable[],
    formulas: [
      { id: "range", name: "Range", expression: "v0^2 * sin(2*theta*pi/180) / g", variables: ["v0", "theta", "g"], unit: "m", description: "Horizontal range" },
      { id: "maxHeight", name: "Max Height", expression: "h0 + v0^2 * sin(theta*pi/180)^2 / (2*g)", variables: ["v0", "theta", "g", "h0"], unit: "m", description: "Maximum height reached" },
      { id: "timeOfFlight", name: "Time of Flight", expression: "(v0 * sin(theta*pi/180) + sqrt(v0^2 * sin(theta*pi/180)^2 + 2*g*h0)) / g", variables: ["v0", "theta", "g", "h0"], unit: "s", description: "Total time in air" },
    ] as ScrubbableFormula[],
  },

  simpleHarmonic: {
    variables: [
      { id: "m", name: "m", value: 1, min: 0.1, max: 10, step: 0.1, unit: "kg", label: "Mass" },
      { id: "k", name: "k", value: 10, min: 1, max: 100, step: 1, unit: "N/m", label: "Spring constant" },
      { id: "A", name: "A", value: 0.1, min: 0, max: 1, step: 0.01, unit: "m", label: "Amplitude" },
    ] as ScrubbableVariable[],
    formulas: [
      { id: "omega", name: "Angular Freq", expression: "sqrt(k/m)", variables: ["m", "k"], unit: "rad/s", description: "ω = √(k/m)" },
      { id: "period", name: "Period", expression: "2*pi*sqrt(m/k)", variables: ["m", "k"], unit: "s", description: "T = 2π√(m/k)" },
      { id: "maxV", name: "Max Velocity", expression: "A*sqrt(k/m)", variables: ["m", "k", "A"], unit: "m/s", description: "v_max = Aω" },
      { id: "maxA", name: "Max Acceleration", expression: "A*k/m", variables: ["m", "k", "A"], unit: "m/s²", description: "a_max = Aω²" },
      { id: "totalE", name: "Total Energy", expression: "0.5*k*A^2", variables: ["k", "A"], unit: "J", description: "E = ½kA²" },
    ] as ScrubbableFormula[],
  },

  rotationalDynamics: {
    variables: [
      { id: "I", name: "I", value: 0.5, min: 0.01, max: 10, step: 0.01, unit: "kg·m²", label: "Moment of inertia" },
      { id: "tau", name: "τ", value: 5, min: 0, max: 50, step: 0.5, unit: "N·m", label: "Torque" },
      { id: "t", name: "t", value: 2, min: 0, max: 10, step: 0.1, unit: "s", label: "Time" },
      { id: "omega0", name: "ω₀", value: 0, min: 0, max: 100, step: 1, unit: "rad/s", label: "Initial angular velocity" },
    ] as ScrubbableVariable[],
    formulas: [
      { id: "alpha", name: "Angular Accel", expression: "tau/I", variables: ["I", "tau"], unit: "rad/s²", description: "α = τ/I" },
      { id: "omega", name: "Angular Velocity", expression: "omega0 + tau/I * t", variables: ["I", "tau", "t", "omega0"], unit: "rad/s", description: "ω = ω₀ + αt" },
      { id: "theta", name: "Angular Displacement", expression: "omega0*t + 0.5*tau/I*t^2", variables: ["I", "tau", "t", "omega0"], unit: "rad", description: "θ = ω₀t + ½αt²" },
      { id: "rotKE", name: "Rotational KE", expression: "0.5*I*(omega0 + tau/I*t)^2", variables: ["I", "tau", "t", "omega0"], unit: "J", description: "K = ½Iω²" },
    ] as ScrubbableFormula[],
  },
};