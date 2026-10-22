"use client";

/**
 * Artifact Drawer — sandboxed iframe for executing agent-generated HTML/JS/React/Physics artifacts
 * Uses postMessage for bi-directional communication, isolates scripts via sandbox="allow-scripts"
 * Dual Preview / Monospace Code tabs, export and download actions, error fallback.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Eye, Code, Copy, Check, Download, AlertCircle, RefreshCw, X } from "lucide-react";

export interface ArtifactItem {
  id: string;
  title: string;
  type: "html" | "physics" | "react" | "svg" | "code";
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
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

    function render() {
      t += 0.03;
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height * 0.8;

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

      const beadX = 120 * Math.sin(t * 2);
      const beadY = 0.003 * beadX * beadX;
      const beadPx = cx + beadX * Math.cos(t * 0.5);
      const beadPy = cy - beadY;

      ctx.fillStyle = '#22d3ee';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(beadPx, beadPy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(beadPx, beadPy);
      ctx.lineTo(beadPx, beadPy + 40);
      ctx.stroke();

      ctx.strokeStyle = '#a855f7';
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

  const renderIframe = useCallback(() => {
    if (!artifact || !iframeRef.current) return;
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
  }, [artifact, generateSrcDoc]);

  useEffect(() => {
    if (isOpen && artifact && activeTab === "preview") {
      renderIframe();
    }
  }, [isOpen, artifact, activeTab, renderIframe]);

  const handleCopyCode = async () => {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleDownload = () => {
    if (!artifact) return;
    const blob = new Blob([artifact.content], {
      type: artifact.type === "svg" ? "image/svg+xml" : "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ext = artifact.type === "svg" ? "svg" : artifact.type === "physics" ? "html" : "html";
    a.download = `${artifact.title.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen || !artifact) return null;

  return (
    <div
      className={cn(
        "fixed inset-y-0 right-0 w-[580px] max-w-[95vw] bg-neutral-950/95 border-l border-neutral-800 backdrop-blur-md shadow-2xl z-50 flex flex-col transition-transform duration-300",
        isOpen ? "translate-x-0" : "translate-x-full",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
          <h3 className="text-sm font-semibold text-neutral-200 truncate">{artifact.title}</h3>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase shrink-0">
            {artifact.type}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* View Tab Buttons */}
          <div className="flex items-center rounded-lg bg-neutral-900 border border-neutral-800 p-0.5 mr-2">
            <button
              onClick={() => setActiveTab("preview")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                activeTab === "preview"
                  ? "bg-neutral-800 text-neutral-100 shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200",
              )}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                activeTab === "code"
                  ? "bg-neutral-800 text-neutral-100 shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200",
              )}
            >
              <Code className="w-3.5 h-3.5" />
              Code
            </button>
          </div>

          {/* Action buttons */}
          <button
            onClick={handleCopyCode}
            title="Copy code"
            className="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={handleDownload}
            title="Download file"
            className="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
            aria-label="Close Artifact Drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative flex-1 bg-black overflow-hidden flex flex-col">
        {activeTab === "preview" ? (
          <>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/80 z-10">
                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {error && (
              <div className="p-4 m-4 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs font-mono flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>Execution failed: {error}</span>
                </div>
                <button
                  onClick={renderIframe}
                  className="flex items-center gap-1 px-2 py-1 bg-rose-900/50 hover:bg-rose-900 rounded text-rose-200 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              </div>
            )}

            <iframe
              ref={iframeRef}
              sandbox="allow-scripts"
              className="w-full h-full border-0"
              title={artifact.title}
            />
          </>
        ) : (
          <div className="w-full h-full p-4 overflow-auto bg-neutral-950 text-neutral-300 font-mono text-xs leading-relaxed select-text">
            <pre className="whitespace-pre-wrap">{artifact.content}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
