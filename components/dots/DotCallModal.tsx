"use client";

import React, { useState, useEffect } from "react";
import { Mic, MicOff, PhoneOff, Minimize2, Maximize2, Volume2, Sparkles } from "lucide-react";
import { DotMascot, type DotCharacter } from "./DotMascot";

interface DotCallModalProps {
  open: boolean;
  onClose: () => void;
  name: string;
  role: string;
  character: DotCharacter;
}

export function DotCallModal({ open, onClose, name, role, character }: DotCallModalProps) {
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [speaking, setSpeaking] = useState(true);

  useEffect(() => {
    if (!open) {
      setSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [open]);

  if (!open) return null;

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95 animate-in slide-in-from-bottom-4 duration-200">
        <DotMascot character={character} size="small" state={speaking ? "working" : "idle"} />
        <div>
          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{name}</div>
          <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
            Call • {formatTimer(seconds)}
          </div>
        </div>
        <button
          onClick={() => setMinimized(false)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Maximize"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-600 shadow-xs"
          title="End Call"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex flex-col items-center justify-between w-full max-w-md h-[480px] rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 p-6 text-white shadow-2xl">
        {/* Top Control Bar */}
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Voice Call</span>
          </div>
          <button
            onClick={() => setMinimized(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
            title="Minimize"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>

        {/* Center Mascot & Speaker Visualizer */}
        <div className="flex flex-col items-center text-center">
          <div className="relative my-4">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl animate-pulse" />
            <DotMascot
              character={character}
              size="call"
              state={speaking ? "working" : "idle"}
              className="relative transition-transform duration-300"
            />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-white">{name}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">{role}</p>

          <div className="mt-3 font-mono text-sm tracking-wider text-emerald-400 font-semibold">
            {formatTimer(seconds)}
          </div>

          {/* Speech transcription feedback */}
          <div className="mt-4 flex items-center gap-2 text-xs text-zinc-300 bg-zinc-800/60 px-4 py-2 rounded-full border border-zinc-700/60 max-w-xs">
            <Volume2 className="h-3.5 w-3.5 text-emerald-400 animate-pulse shrink-0" />
            <span className="truncate">
              {speaking ? `${name} is listening & ready...` : "Connecting audio channel..."}
            </span>
          </div>
        </div>

        {/* Bottom Call Controls */}
        <div className="flex items-center gap-6 pb-2">
          {/* Mute Button */}
          <button
            onClick={() => setMuted((m) => !m)}
            className={`flex flex-col items-center gap-1.5 transition ${
              muted ? "text-amber-400" : "text-zinc-300 hover:text-white"
            }`}
          >
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full border transition ${
                muted
                  ? "border-amber-500/40 bg-amber-500/20 text-amber-400"
                  : "border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700"
              }`}
            >
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </div>
            <span className="text-[10px] font-medium">{muted ? "Muted" : "Mute"}</span>
          </button>

          {/* End Call Button */}
          <button
            onClick={onClose}
            className="flex flex-col items-center gap-1.5 text-zinc-300 hover:text-white transition group"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:bg-red-500 active:scale-95 group-hover:shadow-red-500/20">
              <PhoneOff className="h-6 w-6" />
            </div>
            <span className="text-[10px] font-medium text-red-400">End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
}
