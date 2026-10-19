"use client";

/**
 * Physics Arena — Interactive JEE mechanics problem player
 * Renders canvas simulations with real-time vector visualization
 */

import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { getProblemConfig, getProblemDescription, JEE_PROBLEMS, PhysicsProblemType, ProblemConfig } from "@/lib/physics/arena";

export interface PhysicsArenaProps {
  className?: string;
}

export function PhysicsArena({ className }: PhysicsArenaProps) {
  const [problemType, setProblemType] = useState<PhysicsProblemType>("bead_on_parabolic_wire");
  const [params, setParams] = useState<Record<string, number>>({});
  const [running, setRunning] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const [time, setTime] = useState(0);
  const [frameCount, setFrameCount] = useState(0);

  useEffect(() => {
    const config = getProblemConfig(problemType);
    setParams(config.parameters);
  }, [problemType]);

  const updateParam = (key: string, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const toggleRun = () => {
    setRunning((prev) => !prev);
  };

  const reset = () => {
    setTime(0);
    setFrameCount(0);
  };

  useEffect(() => {
    if (!running || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width = canvas.clientWidth;
    const height = canvas.height = canvas.clientHeight;

    let lastTime = performance.now();
    let t = time;

    const animate = (now: number) => {
      const dt = (now - lastTime) / 1000 * timeScale;
      lastTime = now;
      t += dt;

      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, width, height);

      renderPhysics(ctx, width, height, t, params);

      setTime(t);
      setFrameCount((c) => c + 1);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [running, timeScale, params, time, problemType]);

  const renderPhysics = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    t: number,
    params: Record<string, number>
  ) => {
    switch (problemType) {
      case "bead_on_parabolic_wire":
        renderBeadOnWire(ctx, width, height, t, params);
        break;
      case "double_pendulum":
        renderDoublePendulum(ctx, width, height, t, params);
        break;
      case "gyroscope":
        renderGyroscope(ctx, width, height, t, params);
        break;
      case "central_force":
        renderCentralForce(ctx, width, height, t, params);
        break;
    }
  };

  const renderBeadOnWire = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    t: number,
    params: Record<string, number>
  ) => {
    const { wireA = 0.5, wireOmega = 2.0, beadMass = 1.0, g = 9.81 } = params;

    const cx = width / 2;
    const cy = height * 0.8;
    const scale = Math.min(width, height) * 0.3;

    const wireAngle = wireOmega * t * 0.3;

    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 3;
    ctx.beginPath();

    for (let x = -2; x <= 2; x += 0.02) {
      const y = wireA * x * x;
      const rx = x * Math.cos(wireAngle) - y * Math.sin(wireAngle);
      const ry = x * Math.sin(wireAngle) + y * Math.cos(wireAngle);
      const px = cx + rx * scale;
      const py = cy - ry * scale;

      if (x === -2) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    const omega = wireOmega;
    const a = wireA;
    const xEq = g * a / (omega * omega) * Math.sin(wireAngle);
    const beadX = xEq + 0.5 * Math.sin(t * 2.5);
    const beadY = a * beadX * beadX;

    const beadRx = beadX * Math.cos(wireAngle) - beadY * Math.sin(wireAngle);
    const beadRy = beadX * Math.sin(wireAngle) + beadY * Math.cos(wireAngle);
    const beadPx = cx + beadRx * scale;
    const beadPy = cy - beadRy * scale;

    ctx.fillStyle = "#22d3ee";
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(beadPx, beadPy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    drawVector(ctx, beadPx, beadPy, 0, 35, "#f43f5e", "mg");
    drawVector(ctx, beadPx, beadPy, -beadX * 15 * Math.sin(wireAngle), beadX * 15 * Math.cos(wireAngle), "#a855f7", "F_cf");
    drawVector(ctx, beadPx, beadPy, 0, -35 * Math.cos(wireAngle), "#22c55e", "N");
  };

  const renderDoublePendulum = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    t: number,
    params: Record<string, number>
  ) => {
    const { length1 = 1.0, length2 = 1.0, mass1 = 1.0, mass2 = 1.0, g = 9.81 } = params;
    const scale = Math.min(width, height) * 0.25;
    const cx = width / 2;
    const cy = height * 0.2;

    const angle1 = params.angle1 || Math.PI / 2;
    const angle2 = params.angle2 || Math.PI / 2;
    const a1 = angle1 * Math.sin(t * 2);
    const a2 = angle2 * Math.sin(t * 2.3);

    const x1 = cx + length1 * scale * Math.sin(a1);
    const y1 = cy + length1 * scale * Math.cos(a1);
    const x2 = x1 + length2 * scale * Math.sin(a2);
    const y2 = y1 + length2 * scale * Math.cos(a2);

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.fillStyle = "#f43f5e";
    ctx.shadowColor = "#f43f5e";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x1, y1, 8 + mass1 * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#a855f7";
    ctx.shadowColor = "#a855f7";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x2, y2, 8 + mass2 * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(168, 85, 247, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 + 5 * Math.sin(t * 10), y2 + 5 * Math.cos(t * 10));
    ctx.stroke();
  };

  const renderGyroscope = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    t: number,
    params: Record<string, number>
  ) => {
    const { spinRate = 50.0, mass = 1.0, radius = 0.1, length = 0.3, g = 9.81 } = params;
    const scale = Math.min(width, height) * 0.4;
    const cx = width / 2;
    const cy = height * 0.7;

    const precession = t * 0.5;
    const spin = t * spinRate * 0.01;

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + length * scale * Math.sin(precession), cy - length * scale * Math.cos(precession));
    ctx.stroke();

    const wcx = cx + length * scale * Math.sin(precession);
    const wcy = cy - length * scale * Math.cos(precession);

    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = spin + i * Math.PI / 4;
      const x = wcx + radius * scale * Math.cos(angle);
      const y = wcy + radius * scale * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    drawVector(ctx, wcx, wcy, 0, 30, "#f43f5e", "mg");
    drawVector(ctx, cx, cy, 30 * Math.cos(precession), -30 * Math.sin(precession), "#a855f7", "τ");
  };

  const renderCentralForce = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    t: number,
    params: Record<string, number>
  ) => {
    const { k = 1.0, forceType = 1, mass = 1.0, angularMomentum = 1.0 } = params;
    const scale = Math.min(width, height) * 0.4;
    const cx = width / 2;
    const cy = height / 2;

    const r = 1.0 + 0.3 * Math.sin(t * 0.8);
    const theta = t * angularMomentum * 0.5;

    const px = cx + r * scale * Math.cos(theta);
    const py = cy + r * scale * Math.sin(theta);

    ctx.fillStyle = "#f43f5e";
    ctx.shadowColor = "#f43f5e";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const rt = 0.7 + 0.6 * Math.sin(i * 0.06);
      const tt = i * 0.06 * Math.PI * 2;
      const ox = cx + rt * scale * Math.cos(tt);
      const oy = cy + rt * scale * Math.sin(tt);
      if (i === 0) ctx.moveTo(ox, oy);
      else ctx.lineTo(ox, oy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#22d3ee";
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    drawVector(ctx, px, py, cx - px, cy - py, "#a855f7", "F");
  };

  const drawVector = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    dx: number,
    dy: number,
    color: string,
    label: string
  ) => {
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const ux = dx / len;
    const uy = dy / len;
    const arrowLen = Math.min(len, 50);
    const endX = x + ux * arrowLen;
    const endY = y + uy * arrowLen;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    const headLen = 10;
    const headAngle = Math.PI / 6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - headLen * Math.cos(Math.atan2(uy, ux) - headAngle),
      endY - headLen * Math.sin(Math.atan2(uy, ux) - headAngle)
    );
    ctx.lineTo(
      endX - headLen * Math.cos(Math.atan2(uy, ux) + headAngle),
      endY - headLen * Math.sin(Math.atan2(uy, ux) + headAngle)
    );
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = "11px monospace";
    ctx.fillText(label, endX + 5, endY - 5);
  };

  const config = getProblemConfig(problemType);
  const description = getProblemDescription(problemType);

  return (
    <div className={cn("flex flex-col h-full bg-neutral-950/80 rounded-lg border border-neutral-800 overflow-hidden", className)}>
      <div className="p-4 border-b border-neutral-800 bg-neutral-900/60">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-neutral-200 font-mono">Physics Arena</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={reset}
              disabled={!running && time === 0}
              className="p-2 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 transition-colors disabled:opacity-50"
              title="Reset"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
            <button
              onClick={toggleRun}
              className="p-2 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 transition-colors"
              title={running ? "Pause" : "Play"}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {running ? (
                  <>
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </>
                ) : (
                  <polygon points="5 3 19 12 5 21 5 3" />
                )}
              </svg>
            </button>
          </div>

          <select
            value={problemType}
            onChange={(e) => setProblemType(e.target.value as PhysicsProblemType)}
            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded text-neutral-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          >
            {Object.entries(JEE_PROBLEMS).map(([key, value]) => (
              <option key={key} value={key}>{value.type.replace(/_/g, " ").toUpperCase()}</option>
            ))}
          </select>
        </div>

        <p className="text-sm text-neutral-400 mb-3">{description}</p>

        <div className="grid grid-cols-2 gap-2">
          {Object.entries(params).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <label className="text-xs text-neutral-500 font-mono uppercase tracking-wide">
                {key}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={Math.floor(value * 0.1)}
                  max={Math.ceil(value * 3)}
                  step={value < 1 ? 0.01 : value < 10 ? 0.1 : 1}
                  value={value}
                  onChange={(e) => updateParam(key, parseFloat(e.target.value))}
                  className="flex-1 h-2 bg-neutral-800 rounded-lg appearance-none accent-cyan-400"
                />
                <span className="text-xs font-mono text-neutral-300 w-16 text-right">
                  {value.toFixed(value < 1 ? 2 : 1)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-neutral-500 font-mono uppercase tracking-wide w-24">Time Scale</span>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            value={timeScale}
            onChange={(e) => setTimeScale(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-neutral-800 rounded-lg appearance-none accent-cyan-400"
          />
          <span className="text-xs font-mono text-neutral-300 w-12 text-right">
            {timeScale.toFixed(1)}x
          </span>
        </div>
      </div>

      <div className="flex-1 relative bg-black">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ touchAction: "none" }}
        />

        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs font-mono text-neutral-400 bg-neutral-950/80 px-3 py-2 rounded border border-neutral-800">
          <span>t = {time.toFixed(2)}s</span>
          <span>FPS: ~60</span>
          <span>Frame: {frameCount}</span>
        </div>
      </div>
    </div>
  );
}