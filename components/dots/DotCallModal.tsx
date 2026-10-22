"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, PhoneOff, Minimize2, Maximize2, Volume2, VolumeX, Sparkles, AlertCircle } from "lucide-react";
import { DotMascot, type DotCharacter } from "./DotMascot";

interface DotCallModalProps {
  open: boolean;
  onClose: () => void;
  name: string;
  role: string;
  character: DotCharacter;
  onSendMessage?: (text: string) => void;
  lastAssistantMessage?: string;
  isStreaming?: boolean;
}

export function DotCallModal({
  open,
  onClose,
  name,
  role,
  character,
  onSendMessage,
  lastAssistantMessage,
  isStreaming,
}: DotCallModalProps) {
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [statusText, setStatusText] = useState("Listening for your voice...");
  const [speechSupported, setSpeechSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const lastSpokenMsgRef = useRef<string>("");
  const isOpenRef = useRef<boolean>(open);
  const isMutedRef = useRef<boolean>(muted);

  useEffect(() => {
    isOpenRef.current = open;
    if (!open) {
      lastSpokenMsgRef.current = "";
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [open]);

  useEffect(() => {
    isMutedRef.current = muted;
  }, [muted]);

  // Comprehensive audio/mic stream cleanup on unmount (D-25)
  useEffect(() => {
    return () => {
      isOpenRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Call timer
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

  // Web Speech Synthesis (Dot speaking back)
  useEffect(() => {
    if (!open || !lastAssistantMessage || isStreaming) return;
    if (lastAssistantMessage === lastSpokenMsgRef.current) return;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      // Clean markdown symbols for cleaner TTS voice
      const cleanText = lastAssistantMessage
        .replace(/[*#`_~\[\]()]/g, "")
        .replace(/\n+/g, " ")
        .trim();

      if (cleanText) {
        const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 300));
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        setStatusText(`${name} is speaking...`);
        utterance.onend = () => {
          setStatusText("Listening for your voice...");
        };
        utterance.onerror = () => {
          setStatusText("Listening for your voice...");
        };
        window.speechSynthesis.speak(utterance);
        lastSpokenMsgRef.current = lastAssistantMessage;
      }
    }
  }, [open, lastAssistantMessage, isStreaming, name]);

  // Web Speech Recognition (User speaking)
  useEffect(() => {
    if (!open) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      setStatusText("Web Speech API not supported in this browser. Use chat composer.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        const currentText = final || interim;
        setTranscript(currentText);

        if (final && final.trim().length > 1) {
          setStatusText(`Sent: "${final.trim()}"`);
          if (onSendMessage) {
            onSendMessage(final.trim());
          }
          setTranscript("");
        }
      };

      recognition.onerror = (e: any) => {
        if (e.error !== "no-speech") {
          console.warn("Speech recognition error:", e.error);
        }
      };

      recognition.onend = () => {
        // Auto-restart recognition only if call is still active and not muted (D-25)
        if (isOpenRef.current && !isMutedRef.current) {
          try {
            recognition.start();
          } catch {}
        }
      };

      if (!muted) {
        recognition.start();
      }
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn("Failed to initialize speech recognition:", err);
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [open, muted, onSendMessage]);

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (recognitionRef.current) {
      if (nextMuted) {
        try {
          recognitionRef.current.abort();
        } catch {}
        setStatusText("Microphone muted");
      } else {
        try {
          recognitionRef.current.start();
        } catch {}
        setStatusText("Listening for your voice...");
      }
    }
  };

  const handleEndCall = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    onClose();
  };

  if (!open) return null;

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  if (minimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95 animate-in slide-in-from-bottom-4 duration-200">
        <DotMascot character={character} size="small" state={isStreaming ? "working" : "idle"} />
        <div>
          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{name}</div>
          <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
            Live Call • {formatTimer(seconds)}
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
          onClick={handleEndCall}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500 text-white hover:bg-red-600 shadow-xs cursor-pointer"
          title="End Call"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex flex-col items-center justify-between w-full max-w-md h-[490px] rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 p-6 text-white shadow-2xl">
        {/* Top Control Bar */}
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Interactive Voice Call</span>
          </div>
          <button
            onClick={() => setMinimized(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition cursor-pointer"
            title="Minimize"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>

        {/* Center Mascot & Speaker Visualizer */}
        <div className="flex flex-col items-center text-center">
          <div className="relative my-4">
            <div
              className={`absolute inset-0 rounded-full blur-xl transition-all duration-300 ${
                isStreaming ? "bg-indigo-500/30 scale-125 animate-pulse" : "bg-emerald-500/20"
              }`}
            />
            <DotMascot
              character={character}
              size="call"
              state={isStreaming ? "working" : "idle"}
              className="relative transition-transform duration-300"
            />
          </div>

          <h2 className="text-xl font-bold tracking-tight text-white">{name}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">{role}</p>

          <div className="mt-3 font-mono text-sm tracking-wider text-emerald-400 font-semibold">
            {formatTimer(seconds)}
          </div>

          {/* Speech transcription feedback */}
          <div className="mt-4 flex flex-col items-center gap-1.5 max-w-xs px-2">
            <div className="flex items-center gap-2 text-xs text-zinc-300 bg-zinc-800/80 px-4 py-2 rounded-full border border-zinc-700/60 max-w-full">
              {muted ? (
                <VolumeX className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              ) : (
                <Volume2 className="h-3.5 w-3.5 text-emerald-400 animate-pulse shrink-0" />
              )}
              <span className="truncate text-[11px]">{statusText}</span>
            </div>

            {transcript && (
              <p className="text-[11px] text-zinc-400 italic line-clamp-2 mt-1">
                &ldquo;{transcript}&rdquo;
              </p>
            )}

            {!speechSupported && (
              <div className="flex items-center gap-1 text-[10px] text-amber-400 mt-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                <span>Microphone access requires supported browser (Chrome/Edge/Safari)</span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Call Action Buttons */}
        <div className="flex items-center gap-6">
          <button
            onClick={toggleMute}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition cursor-pointer ${
              muted
                ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                : "bg-zinc-800 text-white hover:bg-zinc-700"
            }`}
            title={muted ? "Unmute mic" : "Mute mic"}
          >
            {muted ? <MicOff className="h-5 w-5 text-red-400" /> : <Mic className="h-5 w-5" />}
          </button>

          <button
            onClick={handleEndCall}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-500 active:scale-95 transition cursor-pointer"
            title="End Call"
          >
            <PhoneOff className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
