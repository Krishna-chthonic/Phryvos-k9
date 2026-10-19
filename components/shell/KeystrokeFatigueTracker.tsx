"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Brain, AlertTriangle, Zap, Coffee, Activity, X } from "lucide-react";

interface KeystrokeMetrics {
  wpm: number;
  rhythmEntropy: number;
  pauseFrequency: number;
  avgPauseDuration: number;
  errorRate: number;
  sessionDurationMin: number;
  lastKeyTime: number;
}

interface FatigueState {
  level: "fresh" | "mild" | "moderate" | "severe";
  score: number; // 0-100
  recommendations: string[];
  showWarning: boolean;
}

const FATIGUE_THRESHOLDS = {
  wpmDrop: 0.3, // 30% drop from peak
  entropySpike: 2.5, // rhythm entropy threshold
  pauseSpike: 2.0, // pause frequency multiplier
  minSampleSize: 200, // minimum keystrokes for reliable metrics
};

export function useKeystrokeTracker(editorRef: React.RefObject<any>, enabled = true) {
  const [metrics, setMetrics] = useState<KeystrokeMetrics>({
    wpm: 0,
    rhythmEntropy: 0,
    pauseFrequency: 0,
    avgPauseDuration: 0,
    errorRate: 0,
    sessionDurationMin: 0,
    lastKeyTime: Date.now(),
  });

  const [fatigue, setFatigue] = useState<FatigueState>({
    level: "fresh",
    score: 0,
    recommendations: [],
    showWarning: false,
  });

  const keystrokeTimesRef = useRef<number[]>([]);
  const peakWpmRef = useRef<number>(0);
  const sessionStartRef = useRef<number>(Date.now());
  const errorCountRef = useRef<number>(0);
  const totalKeystrokesRef = useRef<number>(0);
  const lastKeyTimeRef = useRef<number>(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousTextRef = useRef<string>("");

  // Calculate rhythm entropy using inter-keystroke intervals
  const calculateEntropy = useCallback((intervals: number[]): number => {
    if (intervals.length < 10) return 0;

    // Bin intervals into buckets
    const buckets = new Map<number, number>();
    const binSize = 50; // 50ms bins
    for (const interval of intervals) {
      const bin = Math.floor(interval / binSize) * binSize;
      buckets.set(bin, (buckets.get(bin) || 0) + 1);
    }

    // Shannon entropy
    const total = intervals.length;
    let entropy = 0;
    for (const count of buckets.values()) {
      const p = count / total;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    return entropy;
  }, []);

  const calculateMetrics = useCallback(() => {
    const times = keystrokeTimesRef.current;
    if (times.length < 2) return;

    const now = Date.now();
    const intervals = [];
    for (let i = 1; i < times.length; i++) {
      intervals.push(times[i] - times[i - 1]);
    }

    const recentIntervals = intervals.slice(-100); // Last 100 keystrokes
    const avgInterval = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length;
    const wpm = (60000 / avgInterval) * 0.2; // Approximate: 5 chars per word

    if (wpm > peakWpmRef.current) peakWpmRef.current = wpm;

    const entropy = calculateEntropy(intervals);

    // Pause detection: intervals > 2 seconds
    const pauses = intervals.filter(i => i > 2000);
    const pauseFrequency = pauses.length / (times.length / 100); // pauses per 100 keystrokes
    const avgPauseDuration = pauses.length > 0
      ? pauses.reduce((a, b) => a + b, 0) / pauses.length
      : 0;

    const errorRate = totalKeystrokesRef.current > 0
      ? errorCountRef.current / totalKeystrokesRef.current
      : 0;

    const sessionDurationMin = (now - sessionStartRef.current) / 60000;

    setMetrics({
      wpm: Math.round(wpm),
      rhythmEntropy: Math.round(entropy * 100) / 100,
      pauseFrequency: Math.round(pauseFrequency * 100) / 100,
      avgPauseDuration: Math.round(avgPauseDuration),
      errorRate: Math.round(errorRate * 1000) / 1000,
      sessionDurationMin: Math.round(sessionDurationMin * 10) / 10,
      lastKeyTime: lastKeyTimeRef.current,
    });
  }, [calculateEntropy]);

  const assessFatigue = useCallback(() => {
    const { wpm, rhythmEntropy, pauseFrequency, errorRate, sessionDurationMin } = metrics;
    let score = 0;
    const recommendations: string[] = [];

    // Factor 1: WPM drop from peak
    if (peakWpmRef.current > 20 && wpm > 0) {
      const wpmRatio = wpm / peakWpmRef.current;
      if (wpmRatio < 1 - FATIGUE_THRESHOLDS.wpmDrop) {
        score += 25;
        recommendations.push("Typing speed dropped significantly — consider a 5-min break");
      }
    }

    // Factor 2: Rhythm entropy spike (irregular typing = cognitive load)
    if (rhythmEntropy > FATIGUE_THRESHOLDS.entropySpike) {
      score += 20;
      recommendations.push("Typing rhythm became irregular — mental fatigue detected");
    }

    // Factor 3: Pause frequency spike
    if (pauseFrequency > FATIGUE_THRESHOLDS.pauseSpike) {
      score += 20;
      recommendations.push("Frequent long pauses — working memory overload");
    }

    // Factor 4: Session duration
    if (sessionDurationMin > 45) {
      score += 15;
      if (sessionDurationMin > 90) score += 10;
      recommendations.push("Extended session — natural cognitive depletion");
    }

    // Factor 5: Error rate
    if (errorRate > 0.05) {
      score += 20;
      recommendations.push("High error rate — attention drift");
    }

    // Clamp score
    score = Math.min(100, Math.max(0, score));

    let level: FatigueState["level"] = "fresh";
    if (score >= 70) level = "severe";
    else if (score >= 50) level = "moderate";
    else if (score >= 25) level = "mild";

    // Add restorative recommendations
    if (level !== "fresh") {
      recommendations.push("Switch to FSRS review cards for restorative spaced repetition");
      recommendations.push("Try a 90-second box breathing exercise: 4-4-4-4");
    } else {
      recommendations.push("You're in the zone — maintain flow state");
    }

    setFatigue({
      level,
      score,
      recommendations,
      showWarning: level !== "fresh" && keystrokeTimesRef.current.length > FATIGUE_THRESHOLDS.minSampleSize,
    });
  }, [metrics]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    const now = Date.now();
    keystrokeTimesRef.current.push(now);
    lastKeyTimeRef.current = now;
    totalKeystrokesRef.current++;

    // Detect backspace/delete as error indicator
    if (e.key === "Backspace" || e.key === "Delete") {
      errorCountRef.current++;
    }

    // Keep only recent keystrokes (last 500)
    if (keystrokeTimesRef.current.length > 500) {
      keystrokeTimesRef.current = keystrokeTimesRef.current.slice(-500);
    }
  }, [enabled]);

  const handleCompositionUpdate = useCallback(() => {
    if (!enabled || !editorRef.current) return;

    try {
      const model = editorRef.current.getModel();
      if (model) {
        const currentText = model.getValue();
        const prevText = previousTextRef.current;

        // Simple diff to detect deletions/corrections
        if (currentText.length < prevText.length) {
          errorCountRef.current += prevText.length - currentText.length;
        }

        previousTextRef.current = currentText;
      }
    } catch {
      // Monaco not ready
    }
  }, [enabled, editorRef]);

  useEffect(() => {
    if (!enabled) return;

    const editor = editorRef.current;
    if (!editor) return;

    // Attach keyboard listener
    editor.onKeyDown(handleKeyDown);

    // Poll for text changes
    const model = editor.getModel();
    if (model) {
      previousTextRef.current = model.getValue();
    }

    // Periodic metric calculation
    intervalRef.current = setInterval(() => {
      calculateMetrics();
      assessFatigue();
    }, 3000); // Every 3 seconds

    return () => {
      editor.offKeyDown(handleKeyDown);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [editorRef, enabled, handleKeyDown, calculateMetrics, assessFatigue]);

  const resetSession = useCallback(() => {
    keystrokeTimesRef.current = [];
    peakWpmRef.current = 0;
    sessionStartRef.current = Date.now();
    errorCountRef.current = 0;
    totalKeystrokesRef.current = 0;
    setFatigue({ level: "fresh", score: 0, recommendations: [], showWarning: false });
  }, []);

  return { metrics, fatigue, resetSession };
}

export function KeystrokeFatigueIndicator({
  fatigue,
  onDismiss,
  compact = false
}: {
  fatigue: FatigueState;
  onDismiss?: () => void;
  compact?: boolean;
}) {
  const levelColors = {
    fresh: "bg-emerald-500",
    mild: "bg-amber-500",
    moderate: "bg-orange-500",
    severe: "bg-rose-500",
  };

  const levelIcons = {
    fresh: Brain,
    mild: Activity,
    moderate: AlertTriangle,
    severe: Zap,
  };

  const LevelIcon = levelIcons[fatigue.level];
  const levelColor = levelColors[fatigue.level];

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2 px-2 py-1 rounded-lg", levelColor + "/20 border border-" + levelColor.replace("bg-", "") + "/50")}>
        <LevelIcon className={cn("h-3.5 w-3.5", levelColor.replace("bg-", "text-"))} />
        <span className="text-xs font-medium" style={{ color: levelColor.replace("bg-", "") }}>
          {fatigue.level.charAt(0).toUpperCase() + fatigue.level.slice(1)} {fatigue.score}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LevelIcon className={cn("h-5 w-5", levelColor.replace("bg-", "text-"))} />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            Cognitive Fatigue Monitor
          </span>
          <div className={cn("px-2 py-0.5 rounded-full text-xs font-mono", levelColor + "/20 text-" + levelColor.replace("bg-", ""))}>
            {fatigue.level.toUpperCase()} · {fatigue.score}/100
          </div>
        </div>
        {onDismiss && fatigue.showWarning && (
          <button onClick={onDismiss} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {fatigue.showWarning && (
        <div className="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Cognitive fatigue detected — consider restorative break</span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {fatigue.recommendations.map((rec, i) => (
          <div key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-zinc-400 shrink-0" />
            <span>{rec}</span>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-600 dark:text-emerald-400 text-xs hover:bg-emerald-500/30 transition-colors">
          <Coffee className="h-3.5 w-3.5 inline mr-1" /> 5-min Break
        </button>
        <button className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/50 text-cyan-600 dark:text-cyan-400 text-xs hover:bg-cyan-500/30 transition-colors">
          <Activity className="h-3.5 w-3.5 inline mr-1" /> Box Breathing
        </button>
        <button className="px-3 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/50 text-indigo-600 dark:text-indigo-400 text-xs hover:bg-indigo-500/30 transition-colors">
          <Brain className="h-3.5 w-3.5 inline mr-1" /> FSRS Review
        </button>
      </div>
    </div>
  );
}