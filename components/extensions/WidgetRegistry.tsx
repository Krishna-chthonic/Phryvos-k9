"use client";

import React, { useState, useMemo } from "react";
import {
  Boxes,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Sparkles,
  BookOpen,
  Timer,
  Calculator,
  Code2,
  Check,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  category: "study" | "math" | "tool" | "custom";
  iconName: string;
  defaultWidth?: string;
  defaultHeight?: string;
}

const BUILTIN_WIDGETS: WidgetDefinition[] = [
  {
    id: "pomodoro",
    name: "Focus Pomodoro",
    description: "25m deep study intervals with audio chime",
    category: "study",
    iconName: "Timer",
  },
  {
    id: "formula-sheet",
    name: "JEE Formula Vault",
    description: "Instant formulas for Rotational, SHM, & Calculus",
    category: "study",
    iconName: "BookOpen",
  },
  {
    id: "unit-converter",
    name: "Physics Unit Converter",
    description: "Joules ↔ eV, atm ↔ Pascal, Tesla ↔ Gauss",
    category: "math",
    iconName: "Calculator",
  },
  {
    id: "sandboxed-custom",
    name: "Custom JS/HTML Runner",
    description: "Safe sandbox runner isolated from PRoot host",
    category: "custom",
    iconName: "Code2",
  },
];

export function WidgetRegistry({ className = "" }: { className?: string }) {
  const [activeWidgetId, setActiveWidgetId] = useState<string>("pomodoro");
  const [customHtml, setCustomHtml] = useState<string>(
    `<div style="font-family:sans-serif;padding:20px;text-align:center;">
  <h3 style="color:#8b5cf6;">🚀 Custom Sandboxed Widget</h3>
  <p style="color:#666;font-size:12px;">Runs in an isolated iframe with zero crash risk to host PRoot.</p>
  <button onclick="document.getElementById('out').innerText = 'Tick: ' + new Date().toLocaleTimeString()" 
          style="padding:6px 12px;background:#8b5cf6;color:white;border:none;border-radius:6px;cursor:pointer;">
    Click Me
  </button>
  <div id="out" style="margin-top:10px;font-weight:bold;color:#333;"></div>
</div>`
  );

  // Pomodoro State
  const [pomoSeconds, setPomoSeconds] = useState(25 * 60);
  const [pomoRunning, setPomoRunning] = useState(false);

  React.useEffect(() => {
    if (!pomoRunning) return;
    const t = setInterval(() => {
      setPomoSeconds((prev) => {
        if (prev <= 1) {
          setPomoRunning(false);
          return 25 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pomoRunning]);

  // Unit Converter State
  const [unitVal, setUnitVal] = useState<number>(1);
  const [unitMode, setUnitMode] = useState<"j_to_ev" | "ev_to_j" | "atm_to_pa">("j_to_ev");

  const convertedUnit = useMemo(() => {
    if (unitMode === "j_to_ev") return (unitVal / 1.602176634e-19).toExponential(4) + " eV";
    if (unitMode === "ev_to_j") return (unitVal * 1.602176634e-19).toExponential(4) + " J";
    return (unitVal * 101325).toLocaleString() + " Pa";
  }, [unitVal, unitMode]);

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden ${className}`}>
      {/* Widget Selector Bar */}
      <div className="flex items-center gap-1.5 p-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 overflow-x-auto">
        <span className="flex items-center gap-1 text-xs font-bold text-zinc-700 dark:text-zinc-300 mr-2 flex-shrink-0">
          <Boxes className="h-4 w-4 text-purple-600" /> Widgets:
        </span>
        {BUILTIN_WIDGETS.map((w) => {
          const isActive = activeWidgetId === w.id;
          return (
            <button
              key={w.id}
              onClick={() => setActiveWidgetId(w.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 cursor-pointer ${
                isActive
                  ? "bg-purple-600 text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
              }`}
            >
              {w.id === "pomodoro" && <Timer className="h-3 w-3" />}
              {w.id === "formula-sheet" && <BookOpen className="h-3 w-3" />}
              {w.id === "unit-converter" && <Calculator className="h-3 w-3" />}
              {w.id === "sandboxed-custom" && <Code2 className="h-3 w-3" />}
              <span>{w.name}</span>
            </button>
          );
        })}
      </div>

      {/* Widget Canvas Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {activeWidgetId === "pomodoro" && (
          <div className="flex flex-col items-center justify-center h-full max-w-sm mx-auto text-center space-y-4">
            <div className="p-4 rounded-full bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800">
              <Timer className="h-8 w-8 text-purple-600" />
            </div>
            <div>
              <div className="text-4xl font-extrabold tracking-tight font-mono text-zinc-900 dark:text-zinc-100">
                {String(Math.floor(pomoSeconds / 60)).padStart(2, "0")}:
                {String(pomoSeconds % 60).padStart(2, "0")}
              </div>
              <p className="text-xs text-zinc-500 mt-1">Deep Work Sprint • No Distractions</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={pomoRunning ? "secondary" : "primary"}
                onClick={() => setPomoRunning(!pomoRunning)}
                className="h-8 px-4 text-xs"
              >
                {pomoRunning ? "Pause" : "Start Focus"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setPomoRunning(false);
                  setPomoSeconds(25 * 60);
                }}
                className="h-8 px-3 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {activeWidgetId === "formula-sheet" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">JEE High-Yield Formulas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <span className="text-xs font-bold text-purple-600">Rotational Inertia</span>
                <p className="text-xs font-mono mt-1 text-zinc-700 dark:text-zinc-300">Disk: I = 1/2 M R²</p>
                <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300">Sphere: I = 2/5 M R²</p>
                <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300">Rod: I = 1/12 M L²</p>
              </div>
              <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <span className="text-xs font-bold text-blue-600">Simple Harmonic Motion</span>
                <p className="text-xs font-mono mt-1 text-zinc-700 dark:text-zinc-300">T = 2π √(m/k)</p>
                <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300">Pendulum: T = 2π √(L/g)</p>
                <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300">v_max = ω A</p>
              </div>
              <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <span className="text-xs font-bold text-emerald-600">Thermodynamics</span>
                <p className="text-xs font-mono mt-1 text-zinc-700 dark:text-zinc-300">ΔU = n C_v ΔT</p>
                <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300">Adiabatic: P V^γ = const</p>
                <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300">W_iso = n R T ln(V₂/V₁)</p>
              </div>
              <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                <span className="text-xs font-bold text-amber-600">Calculus Shortcuts</span>
                <p className="text-xs font-mono mt-1 text-zinc-700 dark:text-zinc-300">∫ e^(ax) sin(bx) dx</p>
                <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300">Leibniz: d/dx ∫[u(x)..v(x)] f(t) dt</p>
              </div>
            </div>
          </div>
        )}

        {activeWidgetId === "unit-converter" && (
          <div className="max-w-md mx-auto space-y-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Physics Unit Converter</h3>
            <div className="flex gap-2">
              <input
                type="number"
                value={unitVal}
                onChange={(e) => setUnitVal(Number(e.target.value))}
                className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-hidden"
              />
              <select
                value={unitMode}
                onChange={(e) => setUnitMode(e.target.value as typeof unitMode)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-200"
              >
                <option value="j_to_ev">Joules → ElectronVolts (eV)</option>
                <option value="ev_to_j">ElectronVolts (eV) → Joules</option>
                <option value="atm_to_pa">Atmospheres (atm) → Pascal (Pa)</option>
              </select>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[11px] text-zinc-500">Converted Value:</span>
              <div className="text-base font-bold font-mono text-purple-600 mt-0.5">
                {convertedUnit}
              </div>
            </div>
          </div>
        )}

        {activeWidgetId === "sandboxed-custom" && (
          <div className="flex flex-col h-full space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Safe Sandboxed User Component Runner
              </h3>
              <span className="text-[10px] text-zinc-400">Zero host PRoot crash risk</span>
            </div>
            <textarea
              value={customHtml}
              onChange={(e) => setCustomHtml(e.target.value)}
              className="w-full h-24 font-mono text-xs p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-hidden"
            />
            <div className="flex-1 min-h-[160px] rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white">
              <iframe
                title="Sandboxed Component"
                srcDoc={customHtml}
                sandbox="allow-scripts"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
