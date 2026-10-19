"use client";

/**
 * Boss Fight Arena — "AIR 1 Adversarial Boss Fight" Competitive Mock Arena
 * Timed 5-question multi-concept battle against synthetic rival bot
 * Psychological time cues and post-mortem shortcut analysis
 *
 * Importers: app/(app)/exams/page.tsx (ExamsPage), components/exams/ExamsApp.tsx
 * Affected API: /api/exam-subjects, /api/exam-subjects/:id/topics, /api/study-logs (reads existing data)
 * Data schemas: SubjectRow, TopicRow, StudyLogRow from lib/exam-service.ts
 * User instruction: Continue Phase 3 implementation - Boss Fight Arena
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Zap, Target, Trophy, Skull, Heart, Clock, AlertTriangle,
  Brain, Zap as Bolt, Shield, Sword, Flag,
  TrendingUp, TrendingDown, Activity,
  Pause, Play, RotateCcw, Settings, X,
  CheckCircle, XCircle
} from "lucide-react";

export interface Question {
  id: string;
  text: string;
  subject: string;
  topic: string;
  difficulty: 1 | 2 | 3 | 4 | 5; // 1=Easy, 5=AIR 1 level
  concepts: string[];
  options: {
    id: string;
    text: string;
    isCorrect: boolean;
    trapType?: "misconception" | "sign_error" | "unit_mismatch" | "approximation" | "dimensional";
    explanation: string;
  }[];
  timeLimit: number; // seconds
  shortcutHint?: string; // The elegant solution path
}

export interface RivalState {
  name: string;
  avatar: string;
  score: number;
  currentQuestion: number;
  answeredCorrectly: boolean[];
  averageTime: number;
  streak: number;
  maxStreak: number;
  psychologicalState: "confident" | "pressured" | "desperate" | "calm";
}

export interface PlayerState {
  score: number;
  currentQuestion: number;
  answers: (string | null)[];
  times: number[];
  correctCount: number;
  streak: number;
  maxStreak: number;
  totalTime: number;
}

export interface BossFightResult {
  player: PlayerState;
  rival: RivalState;
  winner: "player" | "rival" | "draw";
  analysis: {
    strengths: string[];
    weaknesses: string[];
    missedShortcuts: string[];
    timeManagement: string;
    recommendation: string;
  };
}

const RIVAL_PERSONAS = [
  {
    name: "AIR-1_Seeker",
    avatar: "🎯",
    description: "The one who finds the shortest path",
    baseAccuracy: 0.95,
    baseSpeed: 0.9,
    psychologicalProfile: "calm" as const,
  },
  {
    name: "Concept_Crusher",
    avatar: "🧠",
    description: "Deep conceptual understanding, zero rote",
    baseAccuracy: 0.92,
    baseSpeed: 0.85,
    psychologicalProfile: "confident" as const,
  },
  {
    name: "Time_Weaver",
    avatar: "⏱️",
    description: "Masters the clock, never rushes, never lags",
    baseAccuracy: 0.88,
    baseSpeed: 0.95,
    psychologicalProfile: "pressured" as const,
  },
];

const QUESTION_BANK: Question[] = [
  {
    id: "q1",
    text: "A bead of mass m slides without friction on a parabolic wire y = kx² rotating about the y-axis with constant angular velocity ω. Find the equilibrium position(s) of the bead.",
    subject: "Physics",
    topic: "Rotating Frames / Lagrangian Mechanics",
    difficulty: 5,
    concepts: ["Centrifugal potential", "Effective potential", "Equilibrium stability", "Lagrange multipliers"],
    options: [
      { id: "a", text: "x = 0 only", isCorrect: false, trapType: "misconception", explanation: "Ignores centrifugal potential creating new equilibria" },
      { id: "b", text: "x = 0 and x = ±√(ω²/2gk)", isCorrect: true, explanation: "Effective potential V_eff = mgy - ½mω²x² = mgkx² - ½mω²x². Minima at x=0 (if ω²<2gk) and x=±√(ω²/2gk-1) for ω²>2gk" },
      { id: "c", text: "x = ±√(gk/ω²)", isCorrect: false, trapType: "sign_error", explanation: "Sign error in centrifugal term" },
      { id: "d", text: "No equilibrium exists", isCorrect: false, trapType: "misconception", explanation: "Forgets rotating frame creates effective potential" },
    ],
    timeLimit: 180,
    shortcutHint: "Use effective potential in rotating frame: V_eff = V_grav + V_centrifugal. Equilibrium where dV_eff/dx = 0.",
  },
  {
    id: "q2",
    text: "A double pendulum with equal masses m and equal lengths L is released from rest with θ₁ = 30°, θ₂ = 0°. What is the initial angular acceleration of the lower mass?",
    subject: "Physics",
    topic: "Rigid Body Dynamics / Coupled Oscillators",
    difficulty: 4,
    concepts: ["Euler-Lagrange equations", "Small angle approximation", "Normal modes", "Constraint forces"],
    options: [
      { id: "a", text: "g/L", isCorrect: false, trapType: "approximation", explanation: "Uses simple pendulum formula, ignores coupling" },
      { id: "b", text: "3g/2L", isCorrect: false, trapType: "misconception", explanation: "Incorrect normal mode frequency" },
      { id: "c", text: "g/2L", isCorrect: true, explanation: "For θ₂=0 initially, lower rod is vertical. Lower mass feels only gravity component along rod: α₂ = -g/L sin θ₁ ≈ -g/2L" },
      { id: "d", text: "√2 g/L", isCorrect: false, trapType: "dimensional", explanation: "Dimensionally incorrect" },
    ],
    timeLimit: 150,
    shortcutHint: "At t=0, θ₂=0 so lower rod is vertical. The tension in upper rod provides centripetal for upper mass only. Lower mass has α = g/L sin θ₁.",
  },
  {
    id: "q3",
    text: "A symmetric top (I₁=I₂≠I₃) spins with angular velocity ω₃ about its symmetry axis while precessing at rate Ω. A constant torque τ is applied perpendicular to the symmetry axis. Find the nutation frequency.",
    subject: "Physics",
    topic: "Rigid Body Dynamics / Gyroscopes",
    difficulty: 5,
    concepts: ["Euler equations", "Nutation", "Precession", "Conserved quantities"],
    options: [
      { id: "a", text: "√(I₃ω₃τ/I₁)", isCorrect: false, trapType: "dimensional", explanation: "Dimensions don't match frequency" },
      { id: "b", text: "I₃ω₃/I₁", isCorrect: false, trapType: "misconception", explanation: "This is precession rate, not nutation" },
      { id: "c", text: "√(I₃ω₃/I₁ * (I₃ω₃/I₁ - τ/ω₃))", isCorrect: true, explanation: "From Euler equations: nutation frequency ω_nut = √(ω₃²(I₃/I₁)² - τI₃/I₁ω₃)" },
      { id: "d", text: "τ/I₁", isCorrect: false, trapType: "misconception", explanation: "Ignores spin angular momentum" },
    ],
    timeLimit: 200,
    shortcutHint: "Use conserved L₃ = I₃ω₃ and energy. Nutation frequency from quadratic in θ̇ from effective potential.",
  },
  {
    id: "q4",
    text: "A particle moves in a central force F = -kr - α/r³ (where r is distance from center). For what value of α does the orbit close after exactly 2 revolutions?",
    subject: "Physics",
    topic: "Central Forces / Bertrand's Theorem",
    difficulty: 5,
    concepts: ["Bertrand's theorem", "Orbit closure", "Effective potential", "Apsidal angle"],
    options: [
      { id: "a", text: "α = 0", isCorrect: false, trapType: "misconception", explanation: "Hooke's law gives closed orbits but 1 revolution per radial oscillation" },
      { id: "b", text: "α = kL²/2m", isCorrect: false, trapType: "approximation", explanation: "Random combination" },
      { id: "c", text: "α = 3kL²/8m", isCorrect: true, explanation: "Apsidal angle Δθ = π√(1 + 3αm/kL²). For 2 rev closure: Δθ = π/2 → α = 3kL²/8m" },
      { id: "d", text: "α = kL²/m", isCorrect: false, trapType: "misconception", explanation: "Gives Δθ = π/√3, not rational multiple of π" },
    ],
    timeLimit: 180,
    shortcutHint: "Apsidal angle formula: Δθ = π/√(1 + 3αm/kL²). For 2 rev closure: Δθ = π/2. Solve for α.",
  },
  {
    id: "q5",
    text: "A thin uniform rod of length L and mass M is pivoted at one end. A particle of mass m strikes the rod at distance d from pivot with velocity v perpendicular to rod and sticks. Find the angular velocity immediately after collision.",
    subject: "Physics",
    topic: "Angular Momentum / Collisions",
    difficulty: 3,
    concepts: ["Angular momentum conservation", "Moment of inertia", "Inelastic collision", "Parallel axis theorem"],
    options: [
      { id: "a", text: "mv/(M/3 + m)", isCorrect: false, trapType: "misconception", explanation: "Uses wrong moment of inertia (forgets parallel axis)" },
      { id: "b", text: "mvd/(ML²/3 + md²)", isCorrect: true, explanation: "L_initial = mvd. I_final = ML²/3 + md². ω = L/I" },
      { id: "c", text: "mvL/(ML²/3 + mL²)", isCorrect: false, trapType: "sign_error", explanation: "Assumes d=L" },
      { id: "d", text: "2mv/(ML + 3mL)", isCorrect: false, trapType: "dimensional", explanation: "Dimensionally incorrect" },
    ],
    timeLimit: 120,
    shortcutHint: "Angular momentum about pivot conserved (no external torque). I_rod = ML²/3. I_particle = md².",
  },
  {
    id: "q6",
    text: "A uniform chain of length L and mass M hangs vertically from a support. The bottom end is released. Find the force on the support when a length x has fallen.",
    subject: "Physics",
    topic: "Variable Mass Systems / Momentum",
    difficulty: 4,
    concepts: ["Variable mass systems", "Momentum flux", "Chain dynamics", "Energy vs momentum"],
    options: [
      { id: "a", text: "Mg(1 + x/L)", isCorrect: false, trapType: "misconception", explanation: "Only weight of fallen part, ignores momentum flux" },
      { id: "b", text: "3Mgx/L", isCorrect: true, explanation: "Weight of fallen part Mgx/L + momentum flux 2Mgx/L = 3Mgx/L" },
      { id: "c", text: "2Mgx/L", isCorrect: false, trapType: "misconception", explanation: "Only momentum flux, ignores weight of fallen part" },
      { id: "d", text: "Mg", isCorrect: false, trapType: "misconception", explanation: "Assumes constant weight" },
    ],
    timeLimit: 150,
    shortcutHint: "Two contributions: weight of fallen chain + rate of momentum transfer from links coming to rest.",
  },
  {
    id: "q7",
    text: "A particle of mass m moves in 1D potential V(x) = ax⁴ - bx² (a,b > 0). Find the frequency of small oscillations about the stable equilibrium.",
    subject: "Physics",
    topic: "Oscillations / Stability Analysis",
    difficulty: 3,
    concepts: ["Taylor expansion", "Effective spring constant", "Small oscillations", "Stable equilibrium"],
    options: [
      { id: "a", text: "√(2b/m)", isCorrect: false, trapType: "approximation", explanation: "Missing factor from Taylor expansion" },
      { id: "b", text: "√(8b/m)", isCorrect: true, explanation: "V'(x) = 4ax³ - 2bx = 0 → x = ±√(b/2a). V'' = 12ax² - 2b = 4b. ω = √(4b/m) = 2√(b/m)" },
      { id: "c", text: "√(4b/m)", isCorrect: false, trapType: "sign_error", explanation: "Correct V'' but wrong frequency formula (missing factor of 2)" },
      { id: "d", text: "√(b/2m)", isCorrect: false, trapType: "dimensional", explanation: "Dimensionally wrong" },
    ],
    timeLimit: 100,
    shortcutHint: "Find stable equilibrium (V'=0, V''>0). ω = √(V''(x_eq)/m).",
  },
  {
    id: "q8",
    text: "A rocket of initial mass M₀ burns fuel at constant rate dm/dt = -μ with exhaust velocity u relative to rocket. No external forces. Find the velocity when mass is M.",
    subject: "Physics",
    topic: "Rocket Equation / Variable Mass",
    difficulty: 2,
    concepts: ["Tsiolkovsky rocket equation", "Momentum conservation", "Integration", "Variable mass"],
    options: [
      { id: "a", text: "u ln(M₀/M)", isCorrect: true, explanation: "Standard rocket equation: v = u ln(M₀/M)" },
      { id: "b", text: "u (M₀/M - 1)", isCorrect: false, trapType: "approximation", explanation: "Linear approximation, not exact" },
      { id: "c", text: "u M₀/M", isCorrect: false, trapType: "dimensional", explanation: "Dimensionally incorrect" },
      { id: "d", text: "u ln(M/M₀)", isCorrect: false, trapType: "sign_error", explanation: "Wrong sign (negative velocity)" },
    ],
    timeLimit: 90,
    shortcutHint: "Rocket equation: dv = -u dm/m. Integrate: v = u ln(M₀/M).",
  },
];

export function BossFightArena({
  onComplete,
  className
}: {
  onComplete?: (result: BossFightResult) => void;
  className?: string;
}) {
  const [phase, setPhase] = useState<"setup" | "fight" | "results">("setup");
  const [selectedRival, setSelectedRival] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [player, setPlayer] = useState<PlayerState>({
    score: 0,
    currentQuestion: 0,
    answers: [],
    times: [],
    correctCount: 0,
    streak: 0,
    maxStreak: 0,
    totalTime: 0,
  });
  const [rival, setRival] = useState<RivalState>({
    name: "",
    avatar: "",
    score: 0,
    currentQuestion: 0,
    answeredCorrectly: [],
    averageTime: 0,
    streak: 0,
    maxStreak: 0,
    psychologicalState: "calm",
  });
  const [timeLeft, setTimeLeft] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [showCountdown, setShowCountdown] = useState(false);

  // Initialize fight
  const startFight = useCallback(() => {
    const rivalPersona = RIVAL_PERSONAS[selectedRival];
    // Select 5 random questions, weighted toward higher difficulty
    const shuffled = [...QUESTION_BANK].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 5);

    setQuestions(selected);
    setRival({
      name: rivalPersona.name,
      avatar: rivalPersona.avatar,
      score: 0,
      currentQuestion: 0,
      answeredCorrectly: [],
      averageTime: 0,
      streak: 0,
      maxStreak: 0,
      psychologicalState: rivalPersona.psychologicalProfile,
    });
    setPlayer({
      score: 0,
      currentQuestion: 0,
      answers: new Array(5).fill(null),
      times: [],
      correctCount: 0,
      streak: 0,
      maxStreak: 0,
      totalTime: 0,
    });
    setCurrentQIndex(0);
    setShowCountdown(true);
    setCountdown(3);

    // Countdown then start
    const countdownTimer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownTimer);
          setShowCountdown(false);
          setPhase("fight");
          startQuestion();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, [selectedRival]);

  const startQuestion = useCallback(() => {
    const question = questions[currentQIndex];
    setTimeLeft(question.timeLimit);
    setQuestionStartTime(Date.now());
    setSelectedAnswer(null);
    setShowExplanation(false);

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleTimeUp();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, [questions, currentQIndex]);

  const handleTimeUp = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const timeTaken = questions[currentQIndex].timeLimit;
    submitAnswer(null, timeTaken);
  }, [questions, currentQIndex]);

  const handleAnswer = useCallback((optionId: string) => {
    if (selectedAnswer || showExplanation) return;
    const timeTaken = Date.now() - questionStartTime;
    setSelectedAnswer(optionId);
    setShowExplanation(true);

    if (timerRef.current) clearInterval(timerRef.current);

    // Brief pause then auto-advance
    setTimeout(() => {
      submitAnswer(optionId, timeTaken);
    }, 2000);
  }, [selectedAnswer, showExplanation, questionStartTime]);

  const submitAnswer = useCallback((answerId: string | null, timeTaken: number) => {
    const question = questions[currentQIndex];
    const correctOption = question.options.find(o => o.isCorrect);
    const isCorrect = answerId === correctOption?.id;

    setPlayer(prev => {
      const newAnswers = [...prev.answers];
      newAnswers[currentQIndex] = answerId;
      const newTimes = [...prev.times, timeTaken / 1000];
      const newStreak = isCorrect ? prev.streak + 1 : 0;
      return {
        ...prev,
        score: prev.score + (isCorrect ? question.difficulty * 100 : 0),
        currentQuestion: currentQIndex + 1,
        answers: newAnswers,
        times: newTimes,
        correctCount: prev.correctCount + (isCorrect ? 1 : 0),
        streak: newStreak,
        maxStreak: Math.max(prev.maxStreak, newStreak),
        totalTime: prev.totalTime + timeTaken / 1000,
      };
    });

    // Simulate rival answer
    const rivalPersona = RIVAL_PERSONAS[selectedRival];
    const rivalCorrect = Math.random() < rivalPersona.baseAccuracy * (1 - question.difficulty * 0.02);
    const rivalTime = question.timeLimit * (0.5 + Math.random() * 0.5) * (2 - rivalPersona.baseSpeed);

    setRival(prev => {
      const newAnswered = [...prev.answeredCorrectly, rivalCorrect];
      const newStreak = rivalCorrect ? prev.streak + 1 : 0;
      return {
        ...prev,
        score: prev.score + (rivalCorrect ? question.difficulty * 100 : 0),
        currentQuestion: currentQIndex + 1,
        answeredCorrectly: newAnswered,
        averageTime: (prev.averageTime * currentQIndex + rivalTime) / (currentQIndex + 1),
        streak: newStreak,
        maxStreak: Math.max(prev.maxStreak, newStreak),
        psychologicalState: currentQIndex >= 3 && prev.score > player.score ? "desperate" :
                           currentQIndex >= 3 && player.score > prev.score ? "pressured" : "calm",
      };
    });

    // Next question or results
    if (currentQIndex < questions.length - 1) {
      setTimeout(() => {
        setCurrentQIndex(i => i + 1);
        startQuestion();
      }, 2500);
    } else {
      setTimeout(() => {
        setPhase("results");
      }, 2500);
    }
  }, [questions, currentQIndex, selectedRival, player.score, startQuestion]);

  const generateAnalysis = useMemo((): BossFightResult["analysis"] => {
    const weakConcepts: Record<string, number> = {};
    const missedShortcuts: string[] = [];

    player.answers.forEach((answer, i) => {
      const q = questions[i];
      const correct = q.options.find(o => o.isCorrect);
      if (answer !== correct?.id) {
        q.concepts.forEach(c => { weakConcepts[c] = (weakConcepts[c] || 0) + 1; });
        if (q.shortcutHint) missedShortcuts.push(q.shortcutHint);
      }
    });

    const avgTime = player.totalTime / questions.length;
    const timeManagement = avgTime > 120 ? "Too slow - practice time-boxed drills" :
                          avgTime > 80 ? "Good pacing" : "Very fast - verify accuracy";

    return {
      strengths: Object.entries(weakConcepts)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3)
        .map(([c]) => c),
      weaknesses: Object.entries(weakConcepts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c]) => c),
      missedShortcuts: missedShortcuts.slice(0, 3),
      timeManagement,
      recommendation: player.correctCount >= 4
        ? "Excellent! Focus on remaining weak concepts for AIR 1."
        : player.correctCount >= 2
        ? "Strong foundation. Drill missed shortcuts and time management."
        : "Review fundamental concepts. Practice with Socratic Auditor first.",
    };
  }, [player, questions]);

  const result = useMemo((): BossFightResult => ({
    player,
    rival,
    winner: player.score > rival.score ? "player" : player.score < rival.score ? "rival" : "draw",
    analysis: generateAnalysis,
  }), [player, rival, generateAnalysis]);

  const currentQuestion = questions[currentQIndex];

  // Cleanup
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  if (phase === "setup") {
    return (
      <div className={cn("bg-neutral-950/80 rounded-lg border border-neutral-800 overflow-hidden flex flex-col h-full", className)}>
        <div className="p-6 border-b border-neutral-800 bg-neutral-900/60 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Skull className="h-8 w-8 text-rose-500" />
            <h2 className="text-2xl font-bold text-neutral-100 font-mono">BOSS FIGHT</h2>
            <Skull className="h-8 w-8 text-rose-500" />
          </div>
          <p className="text-neutral-400 max-w-md mx-auto">
            5 questions. Multi-concept battle. Synthetic AIR 1 rival.
            Find the shortcut or perish.
          </p>
        </div>

        <div className="flex-1 p-6 overflow-y-auto">
          <h3 className="mb-4 text-lg font-semibold text-neutral-300">Choose Your Rival</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {RIVAL_PERSONAS.map((r, i) => (
              <button
                key={r.name}
                onClick={() => setSelectedRival(i)}
                className={cn(
                  "p-4 rounded-xl border-2 transition-all text-left relative overflow-hidden",
                  i === selectedRival
                    ? "border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/20"
                    : "border-neutral-800 hover:border-neutral-600 bg-neutral-900/50"
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{r.avatar}</span>
                  <div>
                    <div className="font-semibold text-neutral-100">{r.name}</div>
                    <div className="text-xs text-neutral-400">{r.description}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>Accuracy: {Math.round(r.baseAccuracy * 100)}%</span>
                  <span>Speed: {Math.round(r.baseSpeed * 100)}%</span>
                </div>
                {i === selectedRival && (
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent" />
                )}
              </button>
            ))}
          </div>

          <div className="mt-8 p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
            <h4 className="font-medium text-neutral-300 mb-2">Rules of Engagement</h4>
            <ul className="text-sm text-neutral-400 space-y-1">
              <li>• 5 questions, increasing difficulty</li>
              <li>• Each has a hidden elegant shortcut</li>
              <li>• Rival adapts psychologically to score</li>
              <li>• Post-mortem reveals your cognitive traps</li>
              <li>• Score = Σ(difficulty × 100) for correct answers</li>
            </ul>
          </div>

          <button
            onClick={startFight}
            className="mt-6 w-full py-4 rounded-lg bg-rose-500/20 border border-rose-500/50 text-rose-400 font-semibold hover:bg-rose-500/30 transition-colors flex items-center justify-center gap-2"
          >
            <Zap className="h-5 w-5" />
            ENTER THE ARENA
          </button>
        </div>
      </div>
    );
  }

  if (phase === "fight" && showCountdown) {
    return (
      <div className={cn("bg-neutral-950/80 rounded-lg border border-neutral-800 overflow-hidden flex flex-col h-full items-center justify-center", className)}>
        <div className="text-center">
          <div className="text-8xl font-mono font-bold text-cyan-400 animate-pulse">{countdown}</div>
          <div className="mt-4 text-lg text-neutral-400">PREPARE</div>
        </div>
      </div>
    );
  }

  if (phase === "fight") {
    const progress = ((questions[currentQIndex].timeLimit - timeLeft) / questions[currentQIndex].timeLimit) * 100;
    const isCritical = timeLeft < 30;

    return (
      <div className={cn("bg-neutral-950/80 rounded-lg border border-neutral-800 overflow-hidden flex flex-col h-full", className)}>
        {/* Header - Rival vs Player */}
        <div className="p-4 border-b border-neutral-800 bg-neutral-900/60">
          <div className="flex items-center justify-between mb-3">
            {/* Rival */}
            <div className="flex items-center gap-3 flex-1">
              <span className="text-3xl">{rival.avatar}</span>
              <div>
                <div className="font-semibold text-neutral-100">{rival.name}</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={cn(
                    "px-2 py-0.5 rounded font-mono",
                    rival.psychologicalState === "calm" && "bg-emerald-500/20 text-emerald-400",
                    rival.psychologicalState === "confident" && "bg-blue-500/20 text-blue-400",
                    rival.psychologicalState === "pressured" && "bg-amber-500/20 text-amber-400",
                    rival.psychologicalState === "desperate" && "bg-rose-500/20 text-rose-400"
                  )}>
                    {rival.psychologicalState.toUpperCase()}
                  </span>
                  <span className="text-neutral-400">{rival.score} pts</span>
                  <span className="text-neutral-500">Streak: {rival.streak}</span>
                </div>
              </div>
            </div>

            {/* Question counter */}
            <div className="text-center px-4">
              <div className="text-xs text-neutral-500">QUESTION</div>
              <div className="text-2xl font-bold font-mono text-cyan-400">{currentQIndex + 1} / {questions.length}</div>
            </div>

            {/* Player */}
            <div className="flex items-center gap-3 flex-1 justify-end">
              <div className="text-right">
                <div className="flex items-center justify-end gap-2 text-xs">
                  <span className="text-neutral-400">Streak: {player.streak}</span>
                  <span className={cn("px-2 py-0.5 rounded font-mono", player.streak >= 3 ? "bg-emerald-500/20 text-emerald-400" : "bg-neutral-800 text-neutral-400")}>
                    {player.score} pts
                  </span>
                </div>
                <div className="font-semibold text-neutral-100">YOU</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                <Target className="h-5 w-5 text-cyan-400" />
              </div>
            </div>
          </div>

          {/* Timer bar */}
          <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-100",
                isCritical ? "bg-rose-500 animate-pulse" : "bg-cyan-500"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className={cn("mt-1 text-right text-sm font-mono", isCritical ? "text-rose-400" : "text-neutral-400")}>
            {timeLeft}s
          </div>
        </div>

        {/* Question */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2 py-0.5 text-xs rounded bg-neutral-800 text-neutral-400 font-mono">
                {currentQuestion.subject}
              </span>
              <span className="px-2 py-0.5 text-xs rounded bg-neutral-800 text-neutral-500">
                {currentQuestion.topic}
              </span>
              <span className={cn(
                "ml-auto px-2 py-0.5 text-xs rounded font-mono",
                currentQuestion.difficulty >= 4 ? "bg-rose-500/20 text-rose-400" :
                currentQuestion.difficulty >= 3 ? "bg-amber-500/20 text-amber-400" :
                "bg-emerald-500/20 text-emerald-400"
              )}>
                DIFF: {currentQuestion.difficulty}/5
              </span>
            </div>

            <div className="mb-6 p-4 rounded-lg bg-neutral-900/50 border border-neutral-800">
              <p className="text-lg text-neutral-100 leading-relaxed font-mono">{currentQuestion.text}</p>
            </div>

            <div className="space-y-3">
              {currentQuestion.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleAnswer(option.id)}
                  disabled={selectedAnswer !== null}
                  className={cn(
                    "w-full p-4 rounded-lg border text-left transition-all text-neutral-100",
                    selectedAnswer === option.id
                      ? option.isCorrect
                        ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/20"
                        : "border-rose-500 bg-rose-500/10 ring-1 ring-rose-500/20"
                      : "border-neutral-800 bg-neutral-900/50 hover:border-neutral-600 hover:bg-neutral-800"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center font-mono text-sm
                      {selectedAnswer === option.id
                        ? (option.isCorrect ? 'border-emerald-500 text-emerald-400' : 'border-rose-500 text-rose-400')
                        : 'border-neutral-600 text-neutral-400'}">
                      {option.id.toUpperCase()}
                    </span>
                    <span className="flex-1">{option.text}</span>
                    {selectedAnswer === option.id && option.isCorrect && (
                      <CheckCircle className="h-5 w-5 text-emerald-400" />
                    )}
                    {selectedAnswer === option.id && !option.isCorrect && (
                      <XCircle className="h-5 w-5 text-rose-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {showExplanation && selectedAnswer && (
              <div className="mt-6 p-4 rounded-lg bg-neutral-900/50 border border-neutral-800 animate-slide-up">
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn(
                    "px-2 py-0.5 text-xs rounded font-mono",
                    currentQuestion.options.find(o => o.id === selectedAnswer)?.isCorrect
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-rose-500/20 text-rose-400"
                  )}>
                    {currentQuestion.options.find(o => o.id === selectedAnswer)?.isCorrect ? "CORRECT" : "INCORRECT"}
                  </span>
                </div>
                <p className="text-sm text-neutral-300">{currentQuestion.options.find(o => o.id === selectedAnswer)?.explanation}</p>
                {currentQuestion.shortcutHint && (
                  <div className="mt-3 p-3 rounded bg-cyan-500/10 border border-cyan-500/30">
                    <div className="flex items-center gap-2 text-xs text-cyan-400 mb-1">
                      <Bolt className="h-3 w-3" />
                      <span className="font-medium">SHORTCUT:</span>
                    </div>
                    <p className="text-sm text-cyan-300 font-mono">{currentQuestion.shortcutHint}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Results phase
  return (
    <div className={cn("bg-neutral-950/80 rounded-lg border border-neutral-800 overflow-hidden flex flex-col h-full", className)}>
      <div className="p-6 border-b border-neutral-800 bg-neutral-900/60 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          {result.winner === "player" && <Trophy className="h-8 w-8 text-amber-500" />}
          {result.winner === "rival" && <Skull className="h-8 w-8 text-rose-500" />}
          {result.winner === "draw" && <Flag className="h-8 w-8 text-cyan-500" />}
          <h2 className="text-2xl font-bold text-neutral-100 font-mono">
            {result.winner === "player" ? "VICTORY" : result.winner === "rival" ? "DEFEAT" : "DRAW"}
          </h2>
        </div>
        <p className="text-neutral-400">
          {result.player.score} vs {result.rival.score} · {result.player.correctCount}/{questions.length} correct
        </p>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Score breakdown */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/50">
              <div className="text-xs text-neutral-500 uppercase tracking-wider mb-2">YOUR SCORE</div>
              <div className="text-3xl font-bold font-mono text-cyan-400">{result.player.score}</div>
              <div className="text-sm text-neutral-400 mt-1">
                {result.player.correctCount}/{questions.length} correct · Streak: {result.player.maxStreak}
              </div>
            </div>
            <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/50">
              <div className="text-xs text-neutral-500 uppercase tracking-wider mb-2">{result.rival.name}</div>
              <div className="text-3xl font-bold font-mono text-rose-400">{result.rival.score}</div>
              <div className="text-sm text-neutral-400 mt-1">
                {result.rival.answeredCorrectly.filter(Boolean).length}/{questions.length} correct · Streak: {result.rival.maxStreak}
              </div>
            </div>
          </div>

          {/* Analysis */}
          <div className="p-4 rounded-lg border border-neutral-800 bg-neutral-900/50">
            <h3 className="font-semibold text-neutral-100 mb-3 flex items-center gap-2">
              <Brain className="h-5 w-5 text-cyan-400" />
              POST-MORTEM ANALYSIS
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> STRENGTHS
                </h4>
                <ul className="text-sm text-neutral-300 space-y-1">
                  {result.analysis.strengths.length > 0 ?
                    result.analysis.strengths.map(s => <li key={s} className="font-mono">• {s}</li>) :
                    <li className="text-neutral-500">None dominant</li>}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium text-rose-400 mb-2 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" /> WEAKNESSES
                </h4>
                <ul className="text-sm text-neutral-300 space-y-1">
                  {result.analysis.weaknesses.map(w => <li key={w} className="font-mono">• {w}</li>)}
                </ul>
              </div>
            </div>

            {result.analysis.missedShortcuts.length > 0 && (
              <div className="p-3 rounded bg-cyan-500/10 border border-cyan-500/30">
                <h4 className="text-sm font-medium text-cyan-400 mb-2 flex items-center gap-1">
                  <Bolt className="h-3 w-3" /> MISSED SHORTCUTS
                </h4>
                <ul className="text-sm text-cyan-300 space-y-1 font-mono">
                  {result.analysis.missedShortcuts.map((s, i) => <li key={i}>→ {s}</li>)}
                </ul>
              </div>
            )}

            <div className="mt-4 p-3 rounded bg-amber-500/10 border border-amber-500/30">
              <h4 className="text-sm font-medium text-amber-400 mb-1 flex items-center gap-1">
                <Clock className="h-3 w-3" /> TIME MANAGEMENT
              </h4>
              <p className="text-sm text-amber-300">{result.analysis.timeManagement}</p>
            </div>

            <div className="mt-4 p-3 rounded bg-emerald-500/10 border border-emerald-500/30">
              <h4 className="text-sm font-medium text-emerald-400 mb-1 flex items-center gap-1">
                <Target className="h-3 w-3" /> RECOMMENDATION
              </h4>
              <p className="text-sm text-emerald-300">{result.analysis.recommendation}</p>
            </div>
          </div>

          {/* Question review */}
          <div>
            <h3 className="font-semibold text-neutral-100 mb-3">QUESTION REVIEW</h3>
            <div className="space-y-2">
              {questions.map((q, i) => {
                const playerAns = result.player.answers[i];
                const correctAns = q.options.find(o => o.isCorrect)?.id;
                const isCorrect = playerAns === correctAns;
                const rivalCorrect = result.rival.answeredCorrectly[i];

                return (
                  <div key={q.id} className="p-3 rounded-lg border bg-neutral-900/50">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs font-mono text-neutral-400 w-8">{i + 1}.</span>
                      <span className="flex-1 text-sm text-neutral-300 line-clamp-1">{q.text}</span>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xs px-1.5 py-0.5 rounded font-mono",
                          isCorrect ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                        )}>
                          {isCorrect ? "✓" : "✗"}
                        </span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded font-mono",
                          rivalCorrect ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                        )}>
                          {rivalCorrect ? "✓" : "✗"}
                        </span>
                      </div>
                    </div>
                    {q.shortcutHint && (
                      <p className="text-xs text-cyan-400 font-mono ml-10">Shortcut: {q.shortcutHint}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => {
              setPhase("setup");
              onComplete?.(result);
            }}
            className="mt-6 w-full py-3 rounded-lg bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 font-medium hover:bg-cyan-500/30 transition-colors"
          >
            RETURN TO SETUP
          </button>
        </div>
      </div>
    </div>
  );
}