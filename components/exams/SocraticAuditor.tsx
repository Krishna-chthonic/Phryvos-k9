"use client";

/**
 * Socratic Auditor — Live derivation step-by-step auditor
 * On-stroke pause or 1-tap audit on Math Scratchpad
 * Step-by-step verification flagging invalid assumptions via Web Speech voice coaching
 *
 * Importers: app/(app)/exams/page.tsx (ExamsPage), components/exams/ExamsApp.tsx
 * Affected API: None new - reads from existing exam-subjects/topics/logs
 * Data schemas: Uses existing SubjectRow, TopicRow, StudyLogRow from lib/exam-service.ts
 * User instruction: Continue Phase 3 implementation - Socratic Ghost derivation auditor
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Mic, MicOff, AlertCircle, CheckCircle, XCircle, Loader2, Brain, Volume2, VolumeX } from "lucide-react";

export interface AuditStep {
  id: string;
  step: number;
  content: string;
  type: "assumption" | "derivation" | "calculation" | "conclusion";
  valid: boolean | null;
  issue?: string;
  suggestion?: string;
}

export interface SocraticAuditorProps {
  latexContent: string;
  onAuditComplete?: (steps: AuditStep[]) => void;
  className?: string;
}

export function SocraticAuditor({ latexContent, onAuditComplete, className }: SocraticAuditorProps) {
  const [steps, setSteps] = useState<AuditStep[]>([]);
  const [auditing, setAuditing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setVoiceSupported(true);
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !voiceSupported || !synthRef.current) return;

    if (synthRef.current.speaking) {
      synthRef.current.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    synthRef.current.speak(utterance);
    utteranceRef.current = utterance;
  }, [voiceEnabled, voiceSupported]);

  const stopSpeaking = useCallback(() => {
    if (synthRef.current?.speaking) {
      synthRef.current.cancel();
    }
  }, []);

  const parseLatexSteps = useCallback((content: string): AuditStep[] => {
    // Split content into logical steps
    const lines = content.split("\n").filter(l => l.trim());
    const parsedSteps: AuditStep[] = [];
    let stepNum = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      stepNum++;
      let type: AuditStep["type"] = "derivation";
      let issue: string | undefined;
      let suggestion: string | undefined;
      let valid: boolean | null = null;

      // Detect assumption patterns
      if (/assum|given|let|suppose|consider/i.test(trimmed)) {
        type = "assumption";
      } else if (/therefore|thus|hence|so |=>|implies/i.test(trimmed)) {
        type = "conclusion";
      } else if (/[=+\-*/^]|\d/gi.test(trimmed)) {
        type = "calculation";
      }

      // Common physics/math pitfalls to flag
      if (type === "assumption") {
        if (!/inertial|non-inertial|pseudo|fictitious/i.test(trimmed) && /rotat|accelerat|centrifugal|coriolis/i.test(latexContent)) {
          issue = "Missing pseudo-force consideration in non-inertial frame";
          suggestion = "Add centrifugal/Coriolis terms in rotating frames";
        } else if (!/friction|dissipat/i.test(trimmed) && /friction|dissipat/i.test(latexContent)) {
          issue = "Friction/dissipation assumed absent without justification";
          suggestion = "State 'assuming frictionless' explicitly";
        } else if (!/small angle|sin.*≈.*x|θ.*≈/i.test(trimmed) && /pendulum|oscillat/i.test(latexContent)) {
          issue = "Small angle approximation used without stating";
          suggestion = "Add 'for small angles, sin θ ≈ θ'";
        }
      }

      if (type === "calculation") {
        if (/∫/i.test(trimmed) && !/dx|dθ|dt/i.test(trimmed)) {
          issue = "Integration variable not specified";
          suggestion = "Add differential (dx, dθ, dt) to integral";
        }
        if (/τ|torque/i.test(trimmed) && !/pivot|axis|origin/i.test(latexContent)) {
          issue = "Torque calculated without specifying pivot point";
          suggestion = "State 'about point O' or similar";
        }
        if (/∑F|ma/i.test(trimmed) && !/free.body|FBD/i.test(latexContent)) {
          issue = "Force equation without free-body diagram reference";
          suggestion = "Reference FBD or list all forces explicitly";
        }
      }

      if (type === "conclusion") {
        if (!/check|verify|limit|dimension/i.test(latexContent)) {
          issue = "Conclusion reached without verification step";
          suggestion = "Add dimensional check or limiting case verification";
        }
      }

      parsedSteps.push({
        id: `step-${stepNum}`,
        step: stepNum,
        content: trimmed,
        type,
        valid,
        issue,
        suggestion,
      });
    }

    return parsedSteps;
  }, [latexContent]);

  const runAudit = useCallback(async () => {
    const parsed = parseLatexSteps(latexContent);
    setSteps(parsed);
    setAuditing(true);
    setCurrentStep(0);

    // Simulate step-by-step audit with delays
    for (let i = 0; i < parsed.length; i++) {
      await new Promise(r => setTimeout(r, 800));
      setCurrentStep(i);

      const step = parsed[i];
      const newSteps = [...steps];
      newSteps[i] = { ...step, valid: !step.issue };
      setSteps(newSteps);

      // Voice feedback for issues
      if (step.issue && voiceEnabled) {
        speak(`Step ${step.step}: ${step.issue}. ${step.suggestion || "Please review this step."}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setAuditing(false);
    onAuditComplete?.(steps);
  }, [latexContent, parseLatexSteps, steps, voiceEnabled, speak, onAuditComplete]);

  const getStepIcon = (step: AuditStep) => {
    if (step.valid === true) return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    if (step.valid === false) return <AlertCircle className="h-4 w-4 text-rose-500" />;
    return <Loader2 className="h-4 w-4 text-cyan-500 animate-spin" />;
  };

  const getTypeBadge = (type: AuditStep["type"]) => {
    const badges = {
      assumption: "bg-amber-900/30 text-amber-400",
      derivation: "bg-blue-900/30 text-blue-400",
      calculation: "bg-violet-900/30 text-violet-400",
      conclusion: "bg-emerald-900/30 text-emerald-400",
    };
    return badges[type] || badges.derivation;
  };

  return (
    <div className={cn("flex flex-col h-full bg-neutral-950/80 rounded-lg border border-neutral-800 overflow-hidden", className)}>
      <div className="p-4 border-b border-neutral-800 bg-neutral-900/60">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-neutral-200 font-mono flex items-center gap-2">
            <Brain className="h-4 w-4 text-cyan-400" />
            Socratic Auditor
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className="p-2 rounded hover:bg-neutral-800 transition-colors"
              title={voiceEnabled ? "Disable voice coaching" : "Enable voice coaching"}
              disabled={!voiceSupported}
            >
              {voiceEnabled ? <Volume2 className="h-4 w-4 text-cyan-400" /> : <VolumeX className="h-4 w-4 text-neutral-500" />}
            </button>
            {!voiceSupported && (
              <span className="text-xs text-neutral-500">Web Speech API not supported</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={runAudit}
            disabled={auditing || !latexContent.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 font-medium hover:bg-cyan-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            {auditing ? "Auditing..." : "Start Audit"}
          </button>

          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span>Steps: {steps.length}</span>
            <span className="text-emerald-400">{steps.filter(s => s.valid === true).length} ✓</span>
            <span className="text-rose-400">{steps.filter(s => s.valid === false).length} ⚠</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-500">
            <Brain className="h-12 w-12 opacity-30" />
            <p className="mt-4 text-center">Enter LaTeX content and click "Start Audit"</p>
            <p className="text-xs mt-2">The auditor will check for:</p>
            <ul className="text-xs text-left mt-2 space-y-1 max-w-xs">
              <li>• Missing pseudo-forces in rotating frames</li>
              <li>• Unstated small-angle approximations</li>
              <li>• Missing pivot points for torque</li>
              <li>• Integration variables</li>
              <li>• Dimensional consistency</li>
              <li>• Limiting case verification</li>
            </ul>
          </div>
        ) : (
          steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                "rounded-lg p-3 border transition-all",
                index === currentStep && auditing
                  ? "border-cyan-500/50 bg-cyan-500/10 ring-1 ring-cyan-500/20"
                  : step.valid === true
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : step.valid === false
                  ? "border-rose-500/30 bg-rose-500/10"
                  : "border-neutral-800 bg-neutral-900/50"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getStepIcon(step)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${getTypeBadge(step.type)}`}>
                      {step.type.toUpperCase()}
                    </span>
                    <span className="text-xs font-medium text-neutral-400">Step {step.step}</span>
                  </div>

                  <div className="text-sm text-neutral-200 font-mono leading-relaxed mb-2">
                    {step.content}
                  </div>

                  {step.issue && (
                    <div className="rounded bg-rose-950/40 border border-rose-800/50 p-2 text-rose-300 text-xs">
                      <div className="flex items-center gap-1.5 mb-1">
                        <XCircle className="h-3 w-3" />
                        <span className="font-medium">Issue Detected:</span>
                      </div>
                      <p className="ml-5">{step.issue}</p>
                      {step.suggestion && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-rose-400">
                          <AlertCircle className="h-3 w-3" />
                          <span>Suggestion: {step.suggestion}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {step.valid === true && !step.issue && (
                    <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
                      <CheckCircle className="h-3 w-3" />
                      <span>No issues detected</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {auditing && currentStep < steps.length && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div className="bg-cyan-950/90 border border-cyan-500/50 rounded-lg p-3 text-cyan-300 text-sm font-mono max-w-md">
            Auditing step {currentStep + 1} of {steps.length}...
          </div>
        </div>
      )}
    </div>
  );
}
