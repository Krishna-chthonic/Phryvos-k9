"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  Network,
  GitBranch,
  ShieldCheck,
  Play,
  RotateCcw,
  FastForward,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Sparkles,
  Send,
  Loader2,
  Layers,
  Activity,
  Award,
} from "lucide-react";
import type { DotDto } from "@/lib/dots-service";
import type {
  SwarmSession,
  SwarmTopology,
  SwarmAgent,
  SwarmTask,
  BlackboardEntry,
  ConsensusBallot,
} from "@/lib/swarm/swarm-engine";

interface SwarmCoordinatorPanelProps {
  dot?: DotDto;
}

export function SwarmCoordinatorPanel({ dot }: SwarmCoordinatorPanelProps) {
  const [session, setSession] = useState<SwarmSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningStep, setRunningStep] = useState(false);
  const [goalInput, setGoalInput] = useState(
    "Synthesize an encrypted vault audit-trail pipeline with tamper detection and recovery hooks",
  );
  const [topology, setTopology] = useState<SwarmTopology>("hierarchical");
  const [blackboardInput, setBlackboardInput] = useState("");
  const [activeSubView, setActiveSubView] = useState<"topology" | "tasks" | "blackboard" | "consensus">("topology");

  const loadSwarmState = useCallback(async () => {
    try {
      const res = await fetch("/api/swarm");
      if (res.ok) {
        const json = await res.json();
        if (json.session) {
          setSession(json.session);
          setTopology(json.session.topology);
        }
      }
    } catch (err) {
      console.error("Failed to load swarm state:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSwarmState();
  }, [loadSwarmState]);

  const handleSpawn = async () => {
    if (!goalInput.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "spawn", goal: goalInput.trim(), topology }),
      });
      const json = await res.json();
      if (json.session) setSession(json.session);
    } catch (err) {
      console.error("Failed to spawn swarm:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStep = async () => {
    setRunningStep(true);
    try {
      const res = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "step" }),
      });
      const json = await res.json();
      if (json.session) setSession(json.session);
    } catch (err) {
      console.error("Failed to step swarm:", err);
    } finally {
      setRunningStep(false);
    }
  };

  const handleAutoRun = async () => {
    setRunningStep(true);
    try {
      for (let i = 0; i < 5; i++) {
        const res = await fetch("/api/swarm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "step" }),
        });
        const json = await res.json();
        if (json.session) {
          setSession(json.session);
          if (json.session.status === "completed") break;
        }
      }
    } catch (err) {
      console.error("Auto run failed:", err);
    } finally {
      setRunningStep(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const json = await res.json();
      if (json.session) setSession(json.session);
    } catch (err) {
      console.error("Failed to reset swarm:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePostBlackboard = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!blackboardInput.trim()) return;

    try {
      const res = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "post_blackboard",
          authorId: "agent-coord",
          topic: "directive",
          content: blackboardInput.trim(),
          tags: ["user", "directive"],
        }),
      });
      const json = await res.json();
      if (json.session) setSession(json.session);
      setBlackboardInput("");
    } catch (err) {
      console.error("Failed to post to blackboard:", err);
    }
  };

  if (loading && !session) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
      </div>
    );
  }

  const agents = session?.agents || [];
  const tasks = session?.tasks || [];
  const blackboard = session?.blackboard || [];
  const ballots = session?.ballots || [];
  const completedTasks = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden text-zinc-900 dark:text-zinc-100">
      {/* Top Banner & Swarm Controls */}
      <div className="shrink-0 p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 text-purple-500 border border-purple-500/20 flex items-center justify-center font-bold">
              🐝
            </div>
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                Ruflo Multi-Agent Swarm Orchestrator
                <span
                  className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border ${
                    session?.status === "completed"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : session?.status === "active"
                      ? "bg-purple-500/20 text-purple-300 border-purple-500/30 animate-pulse"
                      : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
                  }`}
                >
                  {session?.status || "IDLE"}
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Coordinated multi-agent intelligence inspired by ruvnet/ruflo
              </p>
            </div>
          </div>

          {/* Topology Selector Buttons */}
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-xs">
            {(["mesh", "hierarchical", "star", "consensus"] as SwarmTopology[]).map((t) => (
              <button
                key={t}
                onClick={() => setTopology(t)}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] capitalize transition-all cursor-pointer ${
                  topology === t
                    ? "bg-purple-600 text-white font-semibold shadow-xs"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Goal Input & Spawner */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            placeholder="Define high-level objective for the swarm team..."
            className="flex-1 min-w-[200px] h-9 bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 text-xs outline-none focus:border-purple-500/60 text-zinc-800 dark:text-zinc-200"
          />
          <button
            onClick={handleSpawn}
            disabled={loading || runningStep || !goalInput.trim()}
            className="h-9 px-3.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Play className="h-3.5 w-3.5" />
            <span>Spawn</span>
          </button>
          <button
            onClick={handleStep}
            disabled={loading || runningStep || session?.status === "completed"}
            className="h-9 px-3 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 disabled:opacity-50 text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Execute next DAG turn"
          >
            {runningStep ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FastForward className="h-3.5 w-3.5" />}
            <span>Step</span>
          </button>
          <button
            onClick={handleAutoRun}
            disabled={loading || runningStep || session?.status === "completed"}
            className="h-9 px-3 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Auto-run remaining tasks"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Auto-Run</span>
          </button>
          <button
            onClick={handleReset}
            disabled={loading || runningStep}
            className="h-9 p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            title="Reset swarm session"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 border-t border-zinc-200/60 dark:border-zinc-800/60 pt-2 text-xs">
          <button
            onClick={() => setActiveSubView("topology")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              activeSubView === "topology"
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            <span>Topology Map ({agents.length})</span>
          </button>

          <button
            onClick={() => setActiveSubView("tasks")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              activeSubView === "tasks"
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
            }`}
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>DAG Tasks ({completedTasks}/{tasks.length})</span>
          </button>

          <button
            onClick={() => setActiveSubView("blackboard")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              activeSubView === "blackboard"
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Blackboard Mesh ({blackboard.length})</span>
          </button>

          <button
            onClick={() => setActiveSubView("consensus")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              activeSubView === "consensus"
                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Consensus Ballots ({ballots.length})</span>
          </button>
        </div>
      </div>

      {/* Main Subview Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* SUBVIEW 1: TOPOLOGY MAP */}
        {activeSubView === "topology" && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-sm">
              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-mono uppercase font-semibold text-purple-500">
                  Active Swarm Topology: {topology.toUpperCase()}
                </span>
                <span>5-Node Reactive Communication Mesh</span>
              </div>

              {/* Visual Nodes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                {agents.map((ag) => (
                  <div
                    key={ag.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      ag.status === "working"
                        ? "bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/20"
                        : "bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700/60"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{ag.avatar}</span>
                      <span
                        className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded ${
                          ag.status === "working"
                            ? "bg-purple-500 text-white animate-pulse"
                            : "bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                        }`}
                      >
                        {ag.status}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {ag.name}
                    </div>
                    <div className="text-[10px] font-mono text-purple-500 capitalize">
                      Role: {ag.role}
                    </div>
                    <div className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
                      <span>Confidence</span>
                      <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">
                        {(ag.confidenceScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Topology Summary Note */}
              <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs text-purple-700 dark:text-purple-300">
                {topology === "mesh" &&
                  "🔗 Peer-to-Peer Mesh: Every agent can directly communicate with every peer. Optimal for distributed brainstorming and parallel discovery."}
                {topology === "hierarchical" &&
                  "👑 Hierarchical Tree: Queen Coordinator assigns sub-tasks to Specialist Workers, and outputs pass through the Adversarial Critic for verification."}
                {topology === "star" &&
                  "⭐ Star Network: Queen Coordinator sits at the central hub, routing all communications between worker spokes."}
                {topology === "consensus" &&
                  "⚖️ Consensus Cluster: Raft/Gossip protocol requires confidence-weighted majority vote before any deliverable is finalized."}
              </div>
            </div>
          </div>
        )}

        {/* SUBVIEW 2: DAG TASKS */}
        {activeSubView === "tasks" && (
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                No active DAG tasks. Spawn a new swarm session to schedule tasks.
              </div>
            ) : (
              tasks.map((task, idx) => (
                <div
                  key={task.id}
                  className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono font-bold text-zinc-400">
                        #{idx + 1}
                      </span>
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {task.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {task.role}
                      </span>
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                          task.status === "completed"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : task.status === "in_progress"
                            ? "bg-purple-500/20 text-purple-300 animate-pulse"
                            : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500"
                        }`}
                      >
                        {task.status}
                      </span>
                    </div>
                  </div>

                  {task.output && (
                    <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 font-mono text-xs text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60">
                      <span className="text-[10px] text-zinc-400 uppercase block font-semibold mb-1">Deliverable:</span>
                      {task.output}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* SUBVIEW 3: BLACKBOARD MESH */}
        {activeSubView === "blackboard" && (
          <div className="space-y-4">
            {/* Blackboard Composer */}
            <form onSubmit={handlePostBlackboard} className="flex gap-2">
              <input
                type="text"
                value={blackboardInput}
                onChange={(e) => setBlackboardInput(e.target.value)}
                placeholder="Post an observation, artifact, or directive to the swarm blackboard..."
                className="flex-1 h-9 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 text-xs outline-none focus:border-purple-500/60 text-zinc-800 dark:text-zinc-200"
              />
              <button
                type="submit"
                disabled={!blackboardInput.trim()}
                className="h-9 px-4 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <Send className="h-3 w-3" />
                <span>Post</span>
              </button>
            </form>

            {/* Blackboard Stream */}
            <div className="space-y-2.5">
              {blackboard.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-400 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                  Blackboard memory is empty.
                </div>
              ) : (
                blackboard.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1.5 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-purple-500 uppercase">
                          [{item.topic}]
                        </span>
                        <span className="font-mono text-zinc-400">
                          by &lt;{item.authorRole}&gt;
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed font-sans">
                      {item.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SUBVIEW 4: CONSENSUS BALLOTS */}
        {activeSubView === "consensus" && (
          <div className="space-y-3">
            {ballots.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                No consensus votes recorded yet. In Consensus topology or during verification turns, ballots are automatically filed.
              </div>
            ) : (
              ballots.map((ballot) => (
                <div
                  key={ballot.id}
                  className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-purple-500" />
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        Proposal: &ldquo;{ballot.proposal}&rdquo;
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${
                        ballot.passed
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                      }`}
                    >
                      {ballot.passed ? "PASSED" : "REJECTED"} ({(ballot.weightedScore * 100).toFixed(0)}% vs {(ballot.threshold * 100).toFixed(0)}%)
                    </span>
                  </div>

                  {/* Individual Votes */}
                  <div className="space-y-1.5 pt-1">
                    {ballot.votes.map((v, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono capitalize font-medium text-purple-400">
                            {v.agentRole}:
                          </span>
                          <span className="text-zinc-600 dark:text-zinc-300">{v.rationale}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`font-mono uppercase font-bold text-[10px] ${
                              v.vote === "accept"
                                ? "text-emerald-500"
                                : v.vote === "reject"
                                ? "text-rose-500"
                                : "text-zinc-400"
                            }`}
                          >
                            {v.vote}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-400">
                            ({(v.confidence * 100).toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
