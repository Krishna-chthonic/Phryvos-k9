"use client";

/**
 * Constellation Map — 3D Holographic "Syllabus Constellation"
 * Interactive WebGL/Canvas star-map representing syllabus topics
 * Cyan glowing stars for mastered concepts, pulsating red stars for weak backlogs
 * Shockwave pulses on milestone completion
 *
 * Importers: app/(app)/exams/page.tsx (ExamsPage), components/exams/ExamsApp.tsx
 * Affected API: /api/exam-subjects, /api/exam-subjects/:id/topics (reads existing data)
 * Data schemas: SubjectRow, TopicRow from lib/exam-service.ts
 * User instruction: Continue Phase 3 implementation - Syllabus Constellation
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Target, Star, Sparkles, Zap, AlertTriangle,
  CheckCircle, Circle, HelpCircle, Search,
  ZoomIn, ZoomOut, RotateCw, Layers,
  BookOpen, TrendingUp, Award, X
} from "lucide-react";

export interface ConstellationNode {
  id: string;
  name: string;
  subject: string;
  topic: string;
  progress: number; // 0-100
  mastery: "mastered" | "learning" | "weak" | "locked";
  x: number;
  y: number;
  z: number;
  connections: string[]; // node IDs this connects to
  prerequisites: string[];
  isMilestone: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface ConstellationProps {
  subjects: Array<{
    id: number;
    name: string;
    topics: Array<{
      id: number;
      name: string;
      progressPct: number;
      dueDate: string | null;
    }>;
  }>;
  onNodeClick?: (node: ConstellationNode) => void;
  className?: string;
}

const SUBJECT_COLORS: Record<string, string> = {
  "Physics": "#00d4ff",
  "Mathematics": "#ff6b35",
  "Chemistry": "#00ff88",
  "Biology": "#ff3366",
  "Computer Science": "#aa44ff",
  "Default": "#888888",
};

function generateConstellationData(subjects: ConstellationProps["subjects"]): ConstellationNode[] {
  const nodes: ConstellationNode[] = [];

  // Arrange subjects in a circle, topics spiral outward
  subjects.forEach((subject, subjIndex) => {
    const subjectAngle = (subjIndex / subjects.length) * Math.PI * 2;
    const subjectRadius = 150;
    const subjectX = Math.cos(subjectAngle) * subjectRadius;
    const subjectY = Math.sin(subjectAngle) * subjectRadius;

    // Subject center node
    nodes.push({
      id: `subject-${subject.id}`,
      name: subject.name,
      subject: subject.name,
      topic: "",
      progress: subject.topics.length > 0
        ? Math.round(subject.topics.reduce((sum, t) => sum + t.progressPct, 0) / subject.topics.length)
        : 0,
      mastery: subject.topics.length > 0 && subject.topics.every(t => t.progressPct === 100) ? "mastered" :
             subject.topics.some(t => t.progressPct > 0) ? "learning" : "locked",
      x: subjectX,
      y: subjectY,
      z: 0,
      connections: [],
      prerequisites: [],
      isMilestone: true,
      difficulty: 3,
    });

    // Topic nodes in spiral around subject
    subject.topics.forEach((topic, topicIndex) => {
      const topicAngle = subjectAngle + (topicIndex / Math.max(1, subject.topics.length)) * Math.PI * 2 + topicIndex * 0.5;
      const topicRadius = subjectRadius + 60 + topicIndex * 25;
      const topicX = Math.cos(topicAngle) * topicRadius;
      const topicY = Math.sin(topicAngle) * topicRadius;
      const topicZ = (Math.random() - 0.5) * 40;

      const progress = topic.progressPct;
      let mastery: ConstellationNode["mastery"] = "locked";
      if (progress === 100) mastery = "mastered";
      else if (progress >= 50) mastery = "learning";
      else if (progress > 0) mastery = "weak";

      nodes.push({
        id: `topic-${topic.id}`,
        name: topic.name,
        subject: subject.name,
        topic: topic.name,
        progress,
        mastery,
        x: topicX,
        y: topicY,
        z: topicZ,
        connections: [`subject-${subject.id}`],
        prerequisites: [],
        isMilestone: progress === 100,
        difficulty: Math.min(5, Math.max(1, Math.ceil(progress / 20))) as 1 | 2 | 3 | 4 | 5,
      });

      // Connect to subject
      const subjectNode = nodes.find(n => n.id === `subject-${subject.id}`);
      if (subjectNode) {
        subjectNode.connections.push(`topic-${topic.id}`);
      }
    });
  });

  return nodes;
}

export function ConstellationMap({ subjects, onNodeClick, className }: ConstellationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<ConstellationNode[]>([]);
  const [hoveredNode, setHoveredNode] = useState<ConstellationNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<ConstellationNode | null>(null);
  const [view, setView] = useState({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showLabels, setShowLabels] = useState(true);
  const [filterMastery, setFilterMastery] = useState<"all" | "mastered" | "learning" | "weak" | "locked">("all");
  const [animationTime, setAnimationTime] = useState(0);
  const [pulses, setPulses] = useState<Array<{x: number; y: number; radius: number; color: string; life: number}>>([]);

  const width = containerRef.current?.clientWidth || 800;
  const height = containerRef.current?.clientHeight || 600;

  // Generate nodes when subjects change
  useEffect(() => {
    setNodes(generateConstellationData(subjects));
  }, [subjects]);

  // Animation loop
  useEffect(() => {
    let frameId: number;
    const animate = () => {
      setAnimationTime(t => t + 0.016);
      setPulses(prev => prev
        .map(p => ({ ...p, radius: p.radius + 2, life: p.life - 0.02 }))
        .filter(p => p.life > 0)
      );
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Render to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const container = containerRef.current;
      if (!container) return;

      const w = container.clientWidth;
      const h = container.clientHeight;

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.save();

      // Transform
      ctx.translate(w / 2 + view.offsetX, h / 2 + view.offsetY);
      ctx.scale(view.scale, view.scale);
      ctx.rotate(view.rotation);

      // Draw connections
      ctx.strokeStyle = "rgba(0, 212, 255, 0.15)";
      ctx.lineWidth = 1;
      nodes.forEach(node => {
        if (filterMastery !== "all" && node.mastery !== filterMastery && node.mastery !== "locked") return;
        node.connections.forEach(connId => {
          const target = nodes.find(n => n.id === connId);
          if (!target) return;
          if (filterMastery !== "all" && target.mastery !== filterMastery && target.mastery !== "locked") return;

          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        });
      });

      // Draw pulses
      pulses.forEach(pulse => {
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
        ctx.strokeStyle = pulse.color.replace(")", `, ${pulse.life})`).replace("rgb", "rgba");
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Draw nodes
      nodes.forEach(node => {
        if (filterMastery !== "all" && node.mastery !== filterMastery && node.mastery !== "locked") return;

        const color = SUBJECT_COLORS[node.subject] || SUBJECT_COLORS.Default;
        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selectedNode?.id === node.id;
        const pulse = Math.sin(animationTime * 3 + node.x * 0.01) * 0.5 + 0.5;

        let baseRadius = node.isMilestone ? 12 : 8;
        if (isHovered || isSelected) baseRadius *= 1.5;
        if (node.mastery === "mastered") baseRadius *= 1.2;

        // Glow effect
        if (node.mastery === "mastered" || node.mastery === "learning" || node.mastery === "weak") {
          const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, baseRadius * 3);
          if (node.mastery === "mastered") {
            gradient.addColorStop(0, `rgba(0, 212, 255, ${0.3 * pulse})`);
            gradient.addColorStop(1, "rgba(0, 212, 255, 0)");
          } else if (node.mastery === "learning") {
            gradient.addColorStop(0, `rgba(255, 107, 53, ${0.3 * pulse})`);
            gradient.addColorStop(1, "rgba(255, 107, 53, 0)");
          } else if (node.mastery === "weak") {
            gradient.addColorStop(0, `rgba(255, 51, 102, ${0.4 * pulse})`);
            gradient.addColorStop(1, "rgba(255, 51, 102, 0)");
          }
          ctx.beginPath();
          ctx.arc(node.x, node.y, baseRadius * 3, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, baseRadius, 0, Math.PI * 2);

        if (node.mastery === "mastered") {
          ctx.fillStyle = "#00d4ff";
          ctx.fill();
          // Inner glow
          ctx.beginPath();
          ctx.arc(node.x, node.y, baseRadius * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.3)";
          ctx.fill();
        } else if (node.mastery === "learning") {
          ctx.fillStyle = "#ff6b35";
          ctx.fill();
        } else if (node.mastery === "weak") {
          ctx.fillStyle = "#ff3366";
          ctx.fill();
          // Pulsing ring for weak
          ctx.beginPath();
          ctx.arc(node.x, node.y, baseRadius + 3 + pulse * 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 51, 102, ${0.5 * pulse})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = "rgba(136, 136, 136, 0.3)";
          ctx.fill();
          ctx.strokeStyle = "rgba(136, 136, 136, 0.5)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Selection ring
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, baseRadius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = "#00d4ff";
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Label
        if (showLabels && (isHovered || isSelected || node.isMilestone)) {
          ctx.font = `${isHovered || isSelected ? "bold " : ""}11px "JetBrains Mono", monospace`;
          ctx.fillStyle = isHovered || isSelected ? "#ffffff" : "rgba(200,200,200,0.8)";
          ctx.textAlign = "center";
          const label = node.topic || node.name;
          ctx.fillText(label, node.x, node.y - baseRadius - 8);
        }

        // Progress ring for topics
        if (node.topic && node.progress > 0 && node.progress < 100) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, baseRadius + 6, -Math.PI / 2, -Math.PI / 2 + (node.progress / 100) * Math.PI * 2);
          ctx.strokeStyle = node.mastery === "mastered" ? "#00d4ff" :
                           node.mastery === "learning" ? "#ff6b35" : "#ff3366";
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.stroke();
        }
      });

      ctx.restore();
    };

    render();
  }, [nodes, view, hoveredNode, selectedNode, pulses, animationTime, filterMastery, showLabels]);

  // Mouse handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setView(prev => ({
        ...prev,
        offsetX: prev.offsetX + e.clientX - dragStart.x,
        offsetY: prev.offsetY + e.clientY - dragStart.y,
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - canvas.width / 2 - view.offsetX) / view.scale;
    const y = (e.clientY - rect.top - canvas.height / 2 - view.offsetY) / view.scale;

    // Rotate back
    const cos = Math.cos(-view.rotation);
    const sin = Math.sin(-view.rotation);
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;

    // Find closest node
    let closest: ConstellationNode | null = null;
    let minDist = Infinity;

    nodes.forEach(node => {
      if (filterMastery !== "all" && node.mastery !== filterMastery && node.mastery !== "locked") return;
      const dist = Math.hypot(node.x - rx, node.y - ry);
      const radius = node.isMilestone ? 18 : 14;
      if (dist < radius && dist < minDist) {
        minDist = dist;
        closest = node;
      }
    });

    setHoveredNode(closest);
  }, [isDragging, dragStart, nodes, view, filterMastery]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hoveredNode) {
      setSelectedNode(hoveredNode);
      onNodeClick?.(hoveredNode);
    } else {
      setSelectedNode(null);
    }
  }, [hoveredNode, onNodeClick]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setView(prev => ({
      ...prev,
      scale: Math.max(0.3, Math.min(3, prev.scale - e.deltaY * 0.001)),
    }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0 && !hoveredNode) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, [hoveredNode]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrag = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setView(prev => ({
      ...prev,
      offsetX: prev.offsetX + e.clientX - dragStart.x,
      offsetY: prev.offsetY + e.clientY - dragStart.y,
    }));
    setDragStart({ x: e.clientX, y: e.clientY });
  }, [isDragging, dragStart]);

  const triggerMilestonePulse = useCallback((node: ConstellationNode) => {
    setPulses(prev => [...prev, {
      x: node.x,
      y: node.y,
      radius: 20,
      color: node.mastery === "mastered" ? "rgba(0, 212, 255, 0.8)" : "rgba(255, 107, 53, 0.8)",
      life: 1,
    }]);
  }, []);

  // Stats
  const stats = useMemo(() => {
    const allNodes = nodes.filter(n => n.topic);
    return {
      total: allNodes.length,
      mastered: allNodes.filter(n => n.mastery === "mastered").length,
      learning: allNodes.filter(n => n.mastery === "learning").length,
      weak: allNodes.filter(n => n.mastery === "weak").length,
      locked: allNodes.filter(n => n.mastery === "locked").length,
    };
  }, [nodes]);

  const getMasteryIcon = (mastery: ConstellationNode["mastery"]) => {
    switch (mastery) {
      case "mastered": return <CheckCircle className="h-3 w-3 text-cyan-400" />;
      case "learning": return <Star className="h-3 w-3 text-amber-400" />;
      case "weak": return <AlertTriangle className="h-3 w-3 text-rose-400" />;
      case "locked": return <Circle className="h-3 w-3 text-neutral-500" />;
    }
  };

  const getMasteryColor = (mastery: ConstellationNode["mastery"]) => {
    switch (mastery) {
      case "mastered": return "text-cyan-400";
      case "learning": return "text-amber-400";
      case "weak": return "text-rose-400";
      case "locked": return "text-neutral-500";
    }
  };

  return (
    <div className={cn("relative bg-neutral-950/80 rounded-lg border border-neutral-800 overflow-hidden flex flex-col h-full", className)}>
      <div className="p-3 border-b border-neutral-800 bg-neutral-900/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-neutral-100 font-mono flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-400" />
            Syllabus Constellation
          </h2>
          <div className="flex items-center gap-1 text-xs text-neutral-400">
            <span className="px-2 py-0.5 rounded bg-neutral-800 font-mono">{stats.total} topics</span>
            <span className={cn("px-2 py-0.5 rounded font-mono", getMasteryColor("mastered"))}>✓ {stats.mastered}</span>
            <span className={cn("px-2 py-0.5 rounded font-mono", getMasteryColor("learning"))}>★ {stats.learning}</span>
            <span className={cn("px-2 py-0.5 rounded font-mono", getMasteryColor("weak"))}>⚠ {stats.weak}</span>
            <span className={cn("px-2 py-0.5 rounded font-mono", getMasteryColor("locked"))}>○ {stats.locked}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-neutral-400">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={e => setShowLabels(e.target.checked)}
              className="rounded border-neutral-600 text-cyan-500 focus:ring-cyan-500"
            />
            Labels
          </label>

          <select
            value={filterMastery}
            onChange={e => setFilterMastery(e.target.value as typeof filterMastery)}
            className="px-2 py-1 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-100 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            <option value="all">All</option>
            <option value="mastered">Mastered</option>
            <option value="learning">Learning</option>
            <option value="weak">Weak</option>
            <option value="locked">Locked</option>
          </select>

          <div className="flex items-center gap-1">
            <button onClick={() => setView(v => ({ ...v, scale: Math.min(3, v.scale * 1.2) }))} className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100" title="Zoom In"><ZoomIn className="h-4 w-4" /></button>
            <button onClick={() => setView(v => ({ ...v, scale: Math.max(0.3, v.scale / 1.2) }))} className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100" title="Zoom Out"><ZoomOut className="h-4 w-4" /></button>
            <button onClick={() => setView(v => ({ ...v, rotation: v.rotation + Math.PI / 4 }))} className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100" title="Rotate"><RotateCw className="h-4 w-4" /></button>
            <button onClick={() => setView({ scale: 1, offsetX: 0, offsetY: 0, rotation: 0 })} className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100" title="Reset View"><Target className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 relative"
        style={{ width: "100%", height: "100%" }}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="w-full h-full cursor-crosshair"
          style={{ touchAction: "none" }}
        />

        {/* Hover tooltip */}
        {hoveredNode && (
          <div className="absolute pointer-events-none z-10 animate-fade-in"
            style={{
              left: `${width / 2 + view.offsetX + hoveredNode.x * view.scale}px`,
              top: `${height / 2 + view.offsetY + hoveredNode.y * view.scale - 120}px`,
              transform: "translateX(-50%)",
            }}>
            <div className="bg-neutral-950/95 border border-neutral-700 rounded-lg p-3 min-w-[200px] max-w-xs shadow-2xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{hoveredNode.isMilestone ? "🌟" : "⭐"}</span>
                <div>
                  <div className="font-semibold text-neutral-100 text-sm">{hoveredNode.topic || hoveredNode.name}</div>
                  <div className="text-xs text-neutral-400">{hoveredNode.subject}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs mb-2">
                <span className={cn("px-2 py-0.5 rounded font-mono", getMasteryColor(hoveredNode.mastery))}>
                  {getMasteryIcon(hoveredNode.mastery)}
                  {hoveredNode.mastery.charAt(0).toUpperCase() + hoveredNode.mastery.slice(1)}
                </span>
                <span className="text-neutral-500">{hoveredNode.progress}%</span>
              </div>
              <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${hoveredNode.progress}%`,
                    background: hoveredNode.mastery === "mastered" ? "#00d4ff" :
                               hoveredNode.mastery === "learning" ? "#ff6b35" : "#ff3366",
                  }}
                />
              </div>
              {hoveredNode.isMilestone && (
                <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
                  <Award className="h-3 w-3" />
                  Milestone Complete
                </div>
              )}
              <div className="mt-2 text-xs text-neutral-500">Click for details</div>
            </div>
          </div>
        )}

        {/* Selected node detail panel */}
        {selectedNode && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:bottom-4 md:w-80 z-20 animate-slide-up">
            <div className="bg-neutral-950/95 border border-neutral-700 rounded-xl p-4 shadow-2xl">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-neutral-100">{selectedNode.topic || selectedNode.name}</div>
                  <div className="text-xs text-neutral-400">{selectedNode.subject}</div>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-400">Progress</span>
                  <span className="font-mono text-cyan-400">{selectedNode.progress}%</span>
                </div>
                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${selectedNode.progress}%`,
                      background: selectedNode.mastery === "mastered" ? "#00d4ff" :
                                 selectedNode.mastery === "learning" ? "#ff6b35" : "#ff3366",
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-400">Mastery</span>
                  <span className={cn("px-2 py-0.5 rounded font-mono text-xs", getMasteryColor(selectedNode.mastery))}>
                    {getMasteryIcon(selectedNode.mastery)}
                    {selectedNode.mastery.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-400">Difficulty</span>
                  <span className="font-mono text-amber-400">
                    {"★".repeat(selectedNode.difficulty)}{"☆".repeat(5 - selectedNode.difficulty)}
                  </span>
                </div>

                {selectedNode.prerequisites.length > 0 && (
                  <div>
                    <div className="text-xs text-neutral-500 mb-1">Prerequisites</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedNode.prerequisites.map(p => (
                        <span key={p} className="px-1.5 py-0.5 text-[10px] rounded bg-neutral-800 text-neutral-300 font-mono">{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-neutral-800 flex gap-2">
                  <button className="flex-1 py-2 px-3 rounded bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 text-sm font-medium hover:bg-cyan-500/30 transition-colors">
                    <BookOpen className="h-3 w-3 mr-1 inline" />
                    Study
                  </button>
                  <button className="flex-1 py-2 px-3 rounded bg-amber-500/20 border border-amber-500/50 text-amber-400 text-sm font-medium hover:bg-amber-500/30 transition-colors">
                    <Zap className="h-3 w-3 mr-1 inline" />
                    Quick Review
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="p-3 border-t border-neutral-800 bg-neutral-900/40">
        <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-400">
          <span className="font-medium text-neutral-300">Legend:</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-cyan-400" />
            <span>Mastered (100%)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <span>Learning (50-99%)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-rose-400 animate-pulse" />
            <span>Weak (1-49%)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full border border-neutral-500 bg-transparent" />
            <span>Locked (0%)</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-neutral-500">Drag to pan • Scroll to zoom • Click for details</span>
          </div>
        </div>
      </div>
    </div>
  );
}