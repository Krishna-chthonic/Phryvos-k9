"use client";

/**
 * Citation Cables — SVG Bezier curves linking chat citations to Monaco editor lines
 * Draws animated glowing cables from tool results to source lines
 */

import React, { useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";

export interface Citation {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  messageId: string;
}

export interface EditorPosition {
  editorId: string;
  filePath: string;
  lineTop: number;
  lineHeight: number;
  containerRect: DOMRect;
}

interface CablePoint {
  x: number;
  y: number;
}

// Global registry for Monaco editor positions
declare global {
  interface Window {
    __phryvosMonacoPositions?: Map<string, EditorPosition>;
  }
}

function getControlPoint(
  start: CablePoint,
  end: CablePoint,
  curveIntensity = 0.4
): CablePoint {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const curve = Math.min(distance * curveIntensity, 150);

  return {
    x: midX + (dy / distance) * curve,
    y: midY - (dx / distance) * curve,
  };
}

function buildBezierPath(start: CablePoint, end: CablePoint): string {
  const cp = getControlPoint(start, end);
  return `M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${end.x} ${end.y}`;
}

function animateCable(
  path: SVGPathElement,
  duration = 800,
  delay = 0
): void {
  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length}`;
  path.style.strokeDashoffset = `${length}`;
  path.style.transition = `stroke-dashoffset ${duration}ms ease-out ${delay}ms`;

  path.getBoundingClientRect();
  path.style.strokeDashoffset = "0";
}

export function CitationCables({
  citations,
  containerRef,
  className,
  animationDuration = 800,
}: {
  citations: Citation[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
  animationDuration?: number;
}) {
  const pathsRef = useRef<SVGPathElement[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  const editorPositions = useMemo(() => {
    if (typeof window === "undefined") return new Map<string, EditorPosition>();
    return window.__phryvosMonacoPositions || new Map();
  }, []);

  const cables = useMemo(() => {
    const result: Array<{
      id: string;
      path: string;
      color: string;
      citation: Citation;
    }> = [];

    if (!containerRef.current) return result;

    const containerRect = containerRef.current.getBoundingClientRect();
    const sourceX = containerRect.left + 20;
    const sourceY = containerRect.top + containerRect.height * 0.5;

    for (let i = 0; i < citations.length; i++) {
      const citation = citations[i];

      const editorPos = editorPositions.get(citation.filePath);
      if (!editorPos) continue;

      const targetX = editorPos.containerRect.left + 10;
      const targetY = editorPos.lineTop + editorPos.lineHeight / 2;

      const colors = [
        "rgba(34, 211, 238, 0.8)",
        "rgba(167, 139, 250, 0.8)",
        "rgba(34, 197, 94, 0.8)",
        "rgba(251, 146, 60, 0.8)",
        "rgba(244, 63, 94, 0.8)",
      ];
      const color = colors[i % colors.length];

      const path = buildBezierPath(
        { x: sourceX, y: sourceY + i * 30 },
        { x: targetX, y: targetY }
      );

      result.push({
        id: `cable-${citation.messageId}-${citation.lineStart}`,
        path,
        color,
        citation,
      });
    }

    return result;
  }, [citations, containerRef, editorPositions]);

  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      pathsRef.current.forEach((path, index) => {
        animateCable(path, animationDuration, index * 50);
      });
    });

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cables, animationDuration]);

  if (cables.length === 0) return null;

  return (
    <svg
      className={cn(
        "fixed inset-0 pointer-events-none overflow-visible z-40",
        className
      )}
      style={{ width: "100vw", height: "100vh" }}
      aria-hidden="true"
    >
      <defs>
        <filter id="cable-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {cables.map((cable, index) => (
        <path
          key={cable.id}
          ref={(el) => {
            if (el) pathsRef.current[index] = el;
          }}
          d={cable.path}
          stroke={cable.color}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#cable-glow)"
          style={{
            opacity: 0.9,
            transition: "opacity 200ms",
          }}
        />
      ))}
    </svg>
  );
}

export function registerMonacoEditor(
  editorId: string,
  filePath: string,
  lineStart: number,
  lineEnd: number
): void {
  if (typeof window === "undefined") return;

  if (!window.__phryvosMonacoPositions) {
    window.__phryvosMonacoPositions = new Map();
  }

  const container = document.querySelector(`[data-monaco-editor-id="${editorId}"]`);
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const lineHeight = 20;

  window.__phryvosMonacoPositions.set(filePath, {
    editorId,
    filePath,
    lineTop: containerRect.top + (lineStart - 1) * lineHeight,
    lineHeight: (lineEnd - lineStart + 1) * lineHeight,
    containerRect,
  });
}

export function unregisterMonacoEditor(filePath: string): void {
  if (typeof window === "undefined") return;
  window.__phryvosMonacoPositions?.delete(filePath);
}

export function updateMonacoEditorPosition(
  filePath: string,
  lineStart: number,
  lineEnd: number
): void {
  if (typeof window === "undefined") return;

  const editorPos = window.__phryvosMonacoPositions?.get(filePath);
  if (!editorPos) return;

  const container = document.querySelector(`[data-monaco-editor-id="${editorPos.editorId}"]`);
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const lineHeight = 20;

  editorPos.containerRect = containerRect;
  editorPos.lineTop = containerRect.top + (lineStart - 1) * lineHeight;
  editorPos.lineHeight = (lineEnd - lineStart + 1) * lineHeight;
}