"use client";

import React, { useMemo, useState, useCallback } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  Node,
  Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  computeCpmSchedule,
  computeScheduleDiff,
  DagNode,
  CpmNodeResult,
  ScheduleDiffItem,
} from "@/lib/dag-service";
import {
  AlertTriangle,
  Zap,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  ShieldAlert,
  Play,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DagGraphViewProps {
  initialNodes?: DagNode[];
  className?: string;
  onSelectNode?: (nodeId: string) => void;
}

const DEFAULT_JEE_SYLLABUS: DagNode[] = [
  {
    id: "m1",
    name: "Functions & Limits",
    durationHours: 12,
    progressPct: 95,
    prerequisites: [],
  },
  {
    id: "p1",
    name: "Kinematics & 1D/2D Motion",
    durationHours: 14,
    progressPct: 90,
    prerequisites: [],
  },
  {
    id: "p2",
    name: "Newton's Laws & Friction",
    durationHours: 16,
    progressPct: 80,
    prerequisites: ["p1"],
  },
  {
    id: "m2",
    name: "Differential Calculus",
    durationHours: 18,
    progressPct: 75,
    prerequisites: ["m1"],
  },
  {
    id: "p3",
    name: "Work, Energy & Power",
    durationHours: 15,
    progressPct: 85,
    prerequisites: ["p2", "m2"],
  },
  {
    id: "p4",
    name: "Rotational Dynamics & Torque",
    durationHours: 25,
    progressPct: 45, // < 70% threshold -> debt!
    prerequisites: ["p3"],
  },
  {
    id: "p5",
    name: "Gravitation & Planetary Orbits",
    durationHours: 12,
    progressPct: 20,
    prerequisites: ["p4"],
  },
  {
    id: "m3",
    name: "Integral Calculus",
    durationHours: 22,
    progressPct: 60,
    prerequisites: ["m2"],
  },
  {
    id: "p6",
    name: "Electrodynamics & Field Theory",
    durationHours: 28,
    progressPct: 10,
    prerequisites: ["p4", "m3"],
  },
];

export function DagGraphView({
  initialNodes = DEFAULT_JEE_SYLLABUS,
  className = "",
  onSelectNode,
}: DagGraphViewProps) {
  const [nodesData, setNodesData] = useState<DagNode[]>(initialNodes);
  const [filterCriticalOnly, setFilterCriticalOnly] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [diffPreview, setDiffPreview] = useState<ScheduleDiffItem[] | null>(null);
  const [delayInput, setDelayInput] = useState(6);

  // Compute CPM
  const cpm = useMemo(() => computeCpmSchedule(nodesData), [nodesData]);

  // Convert CPM into ReactFlow nodes and edges with layered layout
  const { flowNodes, flowEdges } = useMemo(() => {
    const fnList: Node[] = [];
    const feList: Edge[] = [];

    const nodesArr = Object.values(cpm.nodes);
    const criticalSet = new Set(cpm.criticalPath);

    // Group into levels by topological ES
    const levelsMap = new Map<number, CpmNodeResult[]>();
    for (const node of nodesArr) {
      if (filterCriticalOnly && !node.isCritical) continue;
      const level = Math.floor(node.es / 15);
      if (!levelsMap.has(level)) levelsMap.set(level, []);
      levelsMap.get(level)!.push(node);
    }

    // Assign x, y positions based on levels
    Array.from(levelsMap.entries()).forEach(([level, group]) => {
      group.forEach((node, idx) => {
        const x = level * 280 + 40;
        const y = idx * 140 + 50;

        fnList.push({
          id: node.id,
          position: { x, y },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            label: (
              <div
                onClick={() => {
                  setSelectedNodeId(node.id);
                  onSelectNode?.(node.id);
                }}
                className={`p-3 rounded-xl border text-left cursor-pointer transition-all w-60 shadow-xs ${
                  node.isCritical
                    ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 dark:border-rose-800"
                    : node.blockedByDebt
                    ? "border-amber-400 bg-amber-50/70 dark:bg-amber-950/40 dark:border-amber-800"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                } ${selectedNodeId === node.id ? "ring-2 ring-blue-500 scale-102" : ""}`}
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="font-semibold text-xs truncate text-zinc-900 dark:text-zinc-100">
                    {node.name}
                  </span>
                  {node.isCritical && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white flex items-center gap-0.5">
                      <Zap className="h-2.5 w-2.5" /> CPM
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mb-1.5">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {node.durationHours}h
                  </span>
                  <span>ES: T+{node.es}h</span>
                  <span>Slack: {node.slack}h</span>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden mb-1">
                  <div
                    className={`h-full transition-all ${
                      node.progressPct >= 70 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${node.progressPct}%` }}
                  />
                </div>

                {node.blockedByDebt && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    <ShieldAlert className="h-3 w-3 shrink-0" />
                    <span className="truncate">Prerequisite debt</span>
                  </div>
                )}
              </div>
            ),
          },
        });

        // Add edges
        for (const prereqId of node.prerequisites) {
          if (filterCriticalOnly && (!cpm.nodes[prereqId]?.isCritical || !node.isCritical)) {
            continue;
          }
          const isCritEdge = criticalSet.has(prereqId) && criticalSet.has(node.id);

          feList.push({
            id: `e-${prereqId}-${node.id}`,
            source: prereqId,
            target: node.id,
            animated: isCritEdge,
            style: {
              stroke: isCritEdge ? "#f43f5e" : "#94a3b8",
              strokeWidth: isCritEdge ? 2.5 : 1.5,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isCritEdge ? "#f43f5e" : "#94a3b8",
            },
          });
        }
      });
    });

    return { flowNodes: fnList, flowEdges: feList };
  }, [cpm, filterCriticalOnly, selectedNodeId, onSelectNode]);

  const [nodes, , onNodesChange] = useNodesState(flowNodes);
  const [edges, , onEdgesChange] = useEdgesState(flowEdges);

  // Re-sync when flowNodes or flowEdges change
  const activeNodes = flowNodes;
  const activeEdges = flowEdges;

  const handleTestDelay = () => {
    if (!selectedNodeId) return;
    const diff = computeScheduleDiff(nodesData, selectedNodeId, delayInput);
    setDiffPreview(diff);
  };

  const handleApplyDiff = () => {
    if (!selectedNodeId) return;
    setNodesData((prev) =>
      prev.map((n) =>
        n.id === selectedNodeId ? { ...n, durationHours: n.durationHours + delayInput } : n
      )
    );
    setDiffPreview(null);
  };

  const selectedNode = selectedNodeId ? cpm.nodes[selectedNodeId] : null;

  return (
    <div className={`flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 ${className}`}>
      {/* Header controls bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-sm text-zinc-900 dark:text-zinc-100">
            <Layers className="h-4 w-4 text-blue-500" />
            <span>Topological Syllabus & CPM Visualizer</span>
          </div>

          <span className="text-xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            Total Duration: <strong>{cpm.projectDurationHours}h</strong>
          </span>

          {cpm.totalDebtCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 flex items-center gap-1 font-medium">
              <ShieldAlert className="h-3 w-3" /> {cpm.totalDebtCount} Topics in Debt
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={filterCriticalOnly ? "primary" : "secondary"}
            onClick={() => setFilterCriticalOnly(!filterCriticalOnly)}
            className="text-xs h-8"
          >
            <Zap className="mr-1 h-3.5 w-3.5 text-rose-500" />
            {filterCriticalOnly ? "Showing Critical Path" : "Critical Path Only"}
          </Button>

          <Button
            variant="secondary"
            onClick={() => setNodesData(DEFAULT_JEE_SYLLABUS)}
            className="text-xs h-8"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </div>

      {/* Main Flow Canvas */}
      <div className="flex-1 relative min-h-[420px]">
        <ReactFlow
          nodes={activeNodes}
          edges={activeEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          attributionPosition="bottom-left"
        >
          <Background color="#71717a" gap={20} size={1} />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const node = cpm.nodes[n.id];
              if (node?.isCritical) return "#f43f5e";
              if (node?.blockedByDebt) return "#f59e0b";
              return "#3b82f6";
            }}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90"
          />
        </ReactFlow>

        {/* Selected Node Sidebar Drawer */}
        {selectedNode && (
          <div className="absolute top-3 right-3 w-80 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md p-4 shadow-xl z-20 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{selectedNode.name}</h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">ID: {selectedNode.id}</p>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-2 bg-zinc-50 dark:bg-zinc-950">
                <span className="text-zinc-500 dark:text-zinc-400 block text-[10px]">Earliest Start</span>
                <span className="font-semibold">T+{selectedNode.es}h</span>
              </div>
              <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-2 bg-zinc-50 dark:bg-zinc-950">
                <span className="text-zinc-500 dark:text-zinc-400 block text-[10px]">Latest Start</span>
                <span className="font-semibold">T+{selectedNode.ls}h</span>
              </div>
              <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-2 bg-zinc-50 dark:bg-zinc-950">
                <span className="text-zinc-500 dark:text-zinc-400 block text-[10px]">Slack / Float</span>
                <span className={`font-semibold ${selectedNode.isCritical ? "text-rose-600" : ""}`}>
                  {selectedNode.slack}h
                </span>
              </div>
              <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-2 bg-zinc-50 dark:bg-zinc-950">
                <span className="text-zinc-500 dark:text-zinc-400 block text-[10px]">Mastery Progress</span>
                <span className="font-semibold">{selectedNode.progressPct}%</span>
              </div>
            </div>

            {selectedNode.blockedByDebt && selectedNode.debtReason && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                <div className="flex items-center gap-1 font-semibold mb-0.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Conceptual Debt Lock:
                </div>
                <p className="text-[11px] leading-relaxed">{selectedNode.debtReason}</p>
              </div>
            )}

            {/* Delay simulation test */}
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Simulate Topic Slip:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="40"
                  value={delayInput}
                  onChange={(e) => setDelayInput(Number(e.target.value))}
                  className="w-16 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2 py-1 text-xs"
                />
                <span className="text-xs text-zinc-500">hours</span>
                <Button variant="secondary" onClick={handleTestDelay} className="text-xs h-7 ml-auto">
                  <Play className="mr-1 h-3 w-3" /> Test Diff
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Schedule Diff Modal */}
        {diffPreview && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-blue-500" /> Schedule Diff Preview
                </h3>
                <button
                  onClick={() => setDiffPreview(null)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                A delay of <strong>+{delayInput}h</strong> on <strong>{selectedNode?.name}</strong> impacts {diffPreview.length} downstream topics:
              </p>

              <div className="max-h-56 overflow-y-auto space-y-2 border border-zinc-100 dark:border-zinc-800 rounded-lg p-2.5 bg-zinc-50 dark:bg-zinc-950">
                {diffPreview.map((item) => (
                  <div key={item.nodeId} className="text-xs flex items-center justify-between py-1 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                    <div>
                      <div className="font-semibold text-zinc-800 dark:text-zinc-200">{item.nodeName}</div>
                      <div className="text-[10px] text-zinc-500">{item.reason}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-zinc-400 line-through text-[11px] mr-1">{item.originalStartDate}</span>
                      <ArrowRight className="inline h-2.5 w-2.5 text-zinc-400 mr-1" />
                      <span className="font-bold text-rose-500">{item.newStartDate}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="secondary" className="h-8 text-xs px-3" onClick={() => setDiffPreview(null)}>
                  Cancel
                </Button>
                <Button variant="primary" className="h-8 text-xs px-3" onClick={handleApplyDiff}>
                  Apply Schedule Shift
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
