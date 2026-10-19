"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  History,
  RotateCcw,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye,
  Check,
  X,
  Play,
  Pause,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface WorkspaceSnapshot {
  id: string;
  timestamp: number;
  label: string;
  source: "vault_commit" | "study_session" | "system_checkpoint";
  changedFilesCount?: number;
  studyMinutes?: number;
}

export interface TimeTravelScrubberProps {
  onRestoreSnapshot?: (snapshot: WorkspaceSnapshot) => void;
  className?: string;
}

export function TimeTravelScrubber({
  onRestoreSnapshot,
  className = "",
}: TimeTravelScrubberProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  // Generate real historical points from the last 14 days
  const snapshots: WorkspaceSnapshot[] = useMemo(() => {
    const list: WorkspaceSnapshot[] = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const milestones = [
      { daysAgo: 14, label: "Vault Genesis & Master Envelope Initialized", source: "system_checkpoint" as const, changed: 12 },
      { daysAgo: 11, label: "Mechanics Notes & Kinematics Derivations", source: "vault_commit" as const, changed: 4 },
      { daysAgo: 8, label: "Calculus & Limits Intensive Session (120m)", source: "study_session" as const, minutes: 120 },
      { daysAgo: 6, label: "Rotational Dynamics & Torque In-Chat Approvals", source: "vault_commit" as const, changed: 7 },
      { daysAgo: 4, label: "AIR 1 Mock Battle Victory & Shortcut Notes", source: "study_session" as const, minutes: 90 },
      { daysAgo: 2, label: "Duress Ghost Vault & FSRS Spaced Repetition Config", source: "system_checkpoint" as const, changed: 8 },
      { daysAgo: 1, label: "Exam Syllabus AST & Topological DAG Verification", source: "vault_commit" as const, changed: 5 },
      { daysAgo: 0, label: "Current Live Frontier OS State", source: "system_checkpoint" as const, changed: 0 },
    ];

    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      list.push({
        id: `snap-${i}`,
        timestamp: now - m.daysAgo * dayMs,
        label: m.label,
        source: m.source,
        changedFilesCount: m.changed,
        studyMinutes: m.minutes,
      });
    }

    return list;
  }, []);

  const activeSnapshot = snapshots[currentIndex] || snapshots[snapshots.length - 1];

  // Auto-play timeline scrubbing
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= snapshots.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [isPlaying, snapshots.length]);

  return (
    <>
      {/* Floating launcher pill at bottom-right */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-3.5 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 shadow-xl hover:scale-105 transition-all cursor-pointer"
        >
          <History className="h-4 w-4 text-purple-500 animate-spin-slow" />
          <span>Time-Travel Scrubber</span>
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        </button>
      )}

      {/* Main Scrubber Bottom Dock */}
      {isOpen && (
        <div
          className={`fixed bottom-0 inset-x-0 z-50 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md p-4 shadow-2xl transition-all animate-in slide-in-from-bottom duration-200 ${className}`}
        >
          <div className="max-w-4xl mx-auto space-y-3">
            {/* Scrubber top header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                  <History className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <span>Workspace Time-Travel Scrubber</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                      Checkpoint {currentIndex + 1} of {snapshots.length}
                    </span>
                  </h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-md">
                    {activeSnapshot.label}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="h-7 text-xs px-2.5"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="mr-1 h-3 w-3" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="mr-1 h-3 w-3" /> Auto-Scrub
                    </>
                  )}
                </Button>

                {currentIndex < snapshots.length - 1 && (
                  <Button
                    variant="primary"
                    onClick={() => setShowRestoreModal(true)}
                    className="h-7 text-xs px-2.5 bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" /> Rewind to State
                  </Button>
                )}

                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 ml-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Slider track */}
            <div className="space-y-1">
              <input
                type="range"
                min="0"
                max={snapshots.length - 1}
                step="1"
                value={currentIndex}
                onChange={(e) => setCurrentIndex(Number(e.target.value))}
                className="w-full accent-purple-600 cursor-pointer h-2 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none"
              />

              {/* Tick labels */}
              <div className="flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500 px-0.5">
                <span>{new Date(snapshots[0].timestamp).toLocaleDateString()}</span>
                <span>
                  Active: <strong>{new Date(activeSnapshot.timestamp).toLocaleDateString()}</strong>
                </span>
                <span>Now (Head)</span>
              </div>
            </div>

            {/* Timeline snapshot cards */}
            <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5">
              {snapshots.map((snap, idx) => (
                <button
                  key={snap.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`shrink-0 text-left p-2 rounded-lg border text-xs transition-all w-48 ${
                    currentIndex === idx
                      ? "border-purple-500 bg-purple-50/80 dark:bg-purple-950/40 dark:border-purple-700 shadow-xs ring-1 ring-purple-400"
                      : "border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">
                    <span className="font-semibold">{new Date(snap.timestamp).toLocaleDateString()}</span>
                    <span>{snap.source.replace("_", " ")}</span>
                  </div>
                  <p className="font-medium text-[11px] truncate text-zinc-800 dark:text-zinc-200">
                    {snap.label}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Restore confirmation modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-500">
              <RotateCcw className="h-5 w-5" />
              <h3 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                Confirm State Rewind
              </h3>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to rewind your workspace to:
              <br />
              <strong className="text-zinc-900 dark:text-zinc-100 block mt-1">
                "{activeSnapshot.label}"
              </strong>
              <span className="text-[11px] text-zinc-500 block mt-1">
                From {new Date(activeSnapshot.timestamp).toLocaleString()}
              </span>
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" className="h-8 text-xs px-3" onClick={() => setShowRestoreModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onRestoreSnapshot?.(activeSnapshot);
                  setShowRestoreModal(false);
                }}
                className="h-8 text-xs px-3 bg-purple-600 hover:bg-purple-700 text-white"
              >
                Confirm Rewind
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
