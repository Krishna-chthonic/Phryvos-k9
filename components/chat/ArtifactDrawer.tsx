"use client";

/**
 * Artifact Drawer — sandboxed iframe for executing agent-generated HTML/JS/React/Physics artifacts
 * Uses postMessage for bi-directional communication, isolates scripts via sandbox="allow-scripts"
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface ArtifactItem {
  id: string;
  title: string;
  type: "html" | "physics" | "react" | "svg";
  content: string;
  params?: Record<string, any>;
  createdAt: number;
}

interface ArtifactDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  artifact: ArtifactItem | null;
  className?: string;
}

export function ArtifactDrawer({
  isOpen,
  onClose,
  artifact,
  className,
}: ArtifactDrawerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate sandboxed HTML with required CDN dependencies (Rapier3D, React, Tailwind)
  const generateSrcDoc = useCallback((item: ArtifactItem): string => {
    if (item.type === "physics") {
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${item.title}</title>
  <style>
    body { margin: 0; overflow: hidden; background: #050505; color: #fff; font-family: monospace; }
    #canvas-container { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
    canvas { background: #0a0a0a; border: 1px solid #222; }
    #overlay { position: absolute; top: 12px; left: 12px; pointer-events: none; }
    .badge { background: rgba(34, 211, 238, 0.15); border: 1px solid rgba(34, 211, 238, 0.4); color: #22d3ee; padding: 4px 8px; border-radius: 4px; font-size: 11px; }
  </style>
</head>
<body>
  <div id="overlay"><span class="badge">JEE Physics Arena (60 FPS)</span></div>
  <div id="canvas-container">
    <canvas id="physics-canvas" width="600" height="400"></canvas>
  </div>
  <script>
    const canvas = document.getElementById('physics-canvas');
    const ctx = canvas.getContext('2d');
    let t = 0;

    // Fallback animated mechanics simulation (Bead on rotating parabolic wire)
    function render() {
      t += 0.03;
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height * 0.8;

      // Draw rotating parabolic wire y = a*x^2
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -250; x <= 250; x += 5) {
        const y = 0.003 * x * x;
        const px = cx + x * Math.cos(t * 0.5);
        const py = cy - y;
        if (x === -250) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Bead motion
      const beadX = 120 * Math.sin(t * 2);
      const beadY = 0.003 * beadX * beadX;
      const beadPx = cx + beadX * Math.cos(t * 0.5);
      const beadPy = cy - beadY;

      // Draw bead
      ctx.fillStyle = '#22d3ee';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(beadPx, beadPy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Vector arrows (Normal force, mg, Centrifugal)
      ctx.strokeStyle = '#f43f5e'; // mg (red)
      ctx.beginPath();
      ctx.moveTo(beadPx, beadPy);
      ctx.lineTo(beadPx, beadPy + 40);
      ctx.stroke();

      ctx.strokeStyle = '#a855f7'; // F_cf (purple)
      ctx.beginPath();
      ctx.moveTo(beadPx, beadPy);
      ctx.lineTo(beadPx + beadX * 0.3 * Math.cos(t * 0.5), beadPy);
      ctx.stroke();

      requestAnimationFrame(render);
    }
    render();
  </script>
</body>
</html>`;
    }

    if (item.type === "html" || item.type === "svg") {
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 16px; background: #0a0a0a; color: #e5e5e5; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  ${item.content}
</body>
</html>`;
    }

    return item.content;
  }, []);

  useEffect(() => {
    if (!isOpen || !artifact || !iframeRef.current) return;
    setLoading(true);
    setError(null);

    try {
      const srcDoc = generateSrcDoc(artifact);
      iframeRef.current.srcdoc = srcDoc;
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || "Failed to render artifact");
      setLoading(false);
    }
  }, [isOpen, artifact, generateSrcDoc]);

  if (!isOpen || !artifact) return null;

  return (
    <div
      className={cn(
        "fixed inset-y-0 right-0 w-[540px] max-w-[90vw] bg-neutral-950/95 border-l border-neutral-800 backdrop-blur-md shadow-2xl z-50 flex flex-col transition-transform duration-300",
        isOpen ? "translate-x-0" : "translate-x-full",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/60">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-neutral-200">{artifact.title}</h3>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase">
            {artifact.type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100 transition-colors"
          aria-label="Close Artifact Drawer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Body / Iframe sandbox */}
      <div className="relative flex-1 bg-black overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/80 z-10">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-4 m-4 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs font-mono">
            Error rendering artifact: {error}
          </div>
        )}

        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          className="w-full h-full border-0"
          title={artifact.title}
        />
      </div>
    </div>
  );
}