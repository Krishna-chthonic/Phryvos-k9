"use client";

import * as React from "react";
import { Plus, BookOpen, Clock, Trash2, Edit3, Sparkles, Swords, Brain, Layers, Activity, Network } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SubjectRow, TopicRow, StudyLogRow } from "@/lib/exam-service";
import { ConstellationMap } from "@/components/exams/ConstellationMap";
import { BossFightArena } from "@/components/exams/BossFightArena";
import { FSRSReview } from "@/components/exams/FSRSReview";
import { SocraticAuditor } from "@/components/exams/SocraticAuditor";
import { ScrubbableMath } from "@/components/exams/ScrubbableMath";
import { PhysicsArena } from "@/components/exams/PhysicsArena";
import { KeystrokeFatigueIndicator, useKeystrokeTracker } from "@/components/shell/KeystrokeFatigueTracker";

const DagGraphView = dynamic(() => import("@/components/tasks/DagGraphView").then((m) => m.DagGraphView), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-zinc-400">Loading Syllabus DAG…</div>,
});

// ------------------------------------------------------------ client API

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, opts);
  const body = (await res.json().catch(() => null)) as T & {
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

// ------------------------------------------------------------ state

interface AppState {
  subjects: SubjectRow[];
  selectedSubject: SubjectRow | null;
  topics: TopicRow[];
  selectedTopic: TopicRow | null;
  logs: StudyLogRow[];
  loading: boolean;
  error: string | null;
}

// ------------------------------------------------------------ modal

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
      <div className="w-full max-w-md rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)] text-[var(--fg-0)] p-5 shadow-[var(--shadow-dialog)]">
        <div className="mb-4 flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <h2 className="text-[var(--text-md)] font-semibold text-[var(--fg-0)]">{title}</h2>
          <button onClick={onClose} className="text-[var(--fg-2)] hover:text-[var(--fg-0)] text-lg p-1">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ main app

export function ExamsApp() {
  const [state, setState] = React.useState<AppState>({
    subjects: [],
    selectedSubject: null,
    topics: [],
    selectedTopic: null,
    logs: [],
    loading: false,
    error: null,
  });

  const [viewMode, setViewMode] = React.useState<"topics" | "constellation" | "fsrs" | "bossfight" | "socratic" | "physics" | "dag" | "trap">("topics");
  const [timerSeconds, setTimerSeconds] = React.useState(25 * 60);
  const [timerRunning, setTimerRunning] = React.useState(false);

  React.useEffect(() => {
    let interval: any = null;
    if (timerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0 && timerRunning) {
      setTimerRunning(false);
      if (state.selectedSubject) {
        apiFetch("/api/study-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subjectId: state.selectedSubject.id,
            durationMin: 25,
            note: "Pomodoro Focus Sprint (25m)",
          }),
        }).then(() => loadLogs(undefined, state.selectedSubject?.id));
      }
    }
    return () => clearInterval(interval);
  }, [timerRunning, timerSeconds, state.selectedSubject]);
  const [latexCode, setLatexCode] = React.useState(
    "\\begin{aligned}\n  E_k &= \\frac{1}{2} m v^2 \\\\\n  E_p &= m g h \\\\\n  E_{total} &= E_k + E_p\n\\end{aligned}"
  );
  const [demoVars, setDemoVars] = React.useState([
    { id: "m", name: "m (mass)", value: 2, min: 0.1, max: 10, step: 0.1, unit: "kg" },
    { id: "v", name: "v (velocity)", value: 5, min: 0, max: 20, step: 0.5, unit: "m/s" },
    { id: "h", name: "h (height)", value: 10, min: 0, max: 50, step: 1, unit: "m" },
    { id: "g", name: "g (gravity)", value: 9.8, min: 1, max: 25, step: 0.1, unit: "m/s²" },
  ]);
  const demoFormulas = React.useMemo(() => [
    { id: "ke", name: "Kinetic Energy", expression: "0.5 * m * v^2", variables: ["m", "v"], unit: "J" },
    { id: "pe", name: "Potential Energy", expression: "m * g * h", variables: ["m", "g", "h"], unit: "J" },
    { id: "tot", name: "Total Mechanical Energy", expression: "0.5 * m * v^2 + m * g * h", variables: ["m", "v", "g", "h"], unit: "J" },
  ], []);

  // Keystroke fatigue tracking
  const editorRef = React.useRef<any>(null);
  const { metrics, fatigue, resetSession } = useKeystrokeTracker(editorRef, true);

  const constellationData = React.useMemo(() => {
    if (state.subjects.length === 0) {
      return [
        {
          id: 1,
          name: "Physics (JEE)",
          topics: [
            { id: 101, name: "Kinematics & Projectiles", progressPct: 85, dueDate: null },
            { id: 102, name: "Newton Laws & Pseudo Forces", progressPct: 70, dueDate: null },
            { id: 103, name: "Work Energy Theorem", progressPct: 90, dueDate: null },
            { id: 104, name: "Rotational Dynamics & Torque", progressPct: 40, dueDate: null },
            { id: 105, name: "Gravitation & Keplers Laws", progressPct: 60, dueDate: null },
          ],
        },
        {
          id: 2,
          name: "Mathematics (JEE)",
          topics: [
            { id: 201, name: "Calculus & Limits", progressPct: 95, dueDate: null },
            { id: 202, name: "Definite Integrals", progressPct: 65, dueDate: null },
            { id: 203, name: "Coordinate Geometry", progressPct: 50, dueDate: null },
            { id: 204, name: "Complex Numbers", progressPct: 35, dueDate: null },
          ],
        },
      ];
    }
    return state.subjects.map((s) => ({
      id: s.id,
      name: s.name,
      topics: state.selectedSubject?.id === s.id && state.topics.length > 0
        ? state.topics.map((t) => ({
            id: t.id,
            name: t.name,
            progressPct: t.progressPct,
            dueDate: t.dueDate,
          }))
        : [
            { id: s.id * 100 + 1, name: `${s.name} Core`, progressPct: 65, dueDate: null },
            { id: s.id * 100 + 2, name: `${s.name} Advanced`, progressPct: 30, dueDate: null },
          ],
    }));
  }, [state.subjects, state.selectedSubject, state.topics]);

  const [subjectForm, setSubjectForm] = React.useState({ name: "", targetDate: "", color: "" });
  const [topicForm, setTopicForm] = React.useState({ name: "", dueDate: "" });
  const [logForm, setLogForm] = React.useState({ durationMin: 30, note: "" });
  const [showSubjectModal, setShowSubjectModal] = React.useState(false);
  const [showTopicModal, setShowTopicModal] = React.useState(false);
  const [showLogModal, setShowLogModal] = React.useState(false);

  React.useEffect(() => {
    loadSubjects();
  }, []);

  async function loadSubjects() {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await apiFetch<{ subjects: SubjectRow[] }>("/api/exam-subjects");
      setState((s) => ({ ...s, subjects: data.subjects, loading: false }));
    } catch (e) {
      setState((s) => ({ ...s, error: String(e), loading: false }));
    }
  }

  async function loadTopics(subjectId: number) {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await apiFetch<{ topics: TopicRow[] }>(`/api/exam-subjects/${subjectId}/topics`);
      setState((s) => ({ ...s, topics: data.topics, loading: false }));
    } catch (e) {
      setState((s) => ({ ...s, error: String(e), loading: false }));
    }
  }

  async function loadLogs(topicId?: number, subjectId?: number) {
    const params = new URLSearchParams();
    if (topicId) params.set("topicId", String(topicId));
    if (subjectId) params.set("subjectId", String(subjectId));
    try {
      const data = await apiFetch<{ logs: StudyLogRow[] }>(`/api/study-logs?${params}`);
      setState((s) => ({ ...s, logs: data.logs }));
    } catch {
      // silently ignore
    }
  }

  async function handleCreateSubject() {
    if (!subjectForm.name.trim()) return;
    try {
      const data = await apiFetch<{ subject: SubjectRow }>("/api/exam-subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: subjectForm.name,
          targetDate: subjectForm.targetDate || null,
          color: subjectForm.color || null,
        }),
      });
      setShowSubjectModal(false);
      setSubjectForm({ name: "", targetDate: "", color: "" });
      await loadSubjects();
      selectSubject(data.subject);
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
    }
  }

  async function selectSubject(subject: SubjectRow) {
    setState((s) => ({ ...s, selectedSubject: subject, selectedTopic: null }));
    await loadTopics(subject.id);
  }

  async function handleCreateTopic() {
    if (!topicForm.name.trim() || !state.selectedSubject) return;
    try {
      const data = await apiFetch<{ topic: TopicRow }>(
        `/api/exam-subjects/${state.selectedSubject.id}/topics`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: topicForm.name,
            dueDate: topicForm.dueDate || null,
          }),
        },
      );
      setShowTopicModal(false);
      setTopicForm({ name: "", dueDate: "" });
      await loadTopics(state.selectedSubject.id);
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
    }
  }

  async function handleProgressChange(topicId: number, pct: number) {
    if (!state.selectedSubject) return;
    try {
      await apiFetch(`/api/exam-subjects/${state.selectedSubject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // topic update via topic endpoint
      });
      // Re-fetch topics
      await loadTopics(state.selectedSubject.id);
    } catch {
      // ignore
    }
  }

  async function handleCreateLog() {
    if (!state.selectedTopic && !state.selectedSubject) return;
    try {
      const data = await apiFetch<{ log: StudyLogRow }>("/api/study-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: state.selectedTopic?.id ?? null,
          subjectId: state.selectedSubject?.id ?? null,
          durationMin: logForm.durationMin,
          note: logForm.note || null,
        }),
      });
      setShowLogModal(false);
      setLogForm({ durationMin: 30, note: "" });
      await loadLogs(state.selectedTopic?.id, state.selectedSubject?.id);
    } catch (e) {
      setState((s) => ({ ...s, error: String(e) }));
    }
  }

  const totalStudyMin = state.logs.reduce((sum, l) => sum + l.durationMin, 0);
  const totalStudyHrs = (totalStudyMin / 60).toFixed(1);

  const targetDateObj = state.selectedSubject?.targetDate
    ? new Date(state.selectedSubject.targetDate)
    : null;
  const daysUntilExam = targetDateObj
    ? Math.ceil((targetDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-full flex-col gap-3 p-5 bg-[var(--bg-0)] text-[var(--fg-0)] select-none overflow-hidden">
      {/* ── Top Header Bar ── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-[var(--text-lg)] font-semibold text-[var(--fg-0)] tracking-tight">
            Study & Exam OS
          </h1>
          <p className="text-[var(--text-xs)] text-[var(--fg-2)] mt-0.5">
            Spaced repetition, concept graph, and active recall sprints
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Focus Sprint Timer */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-[var(--radius-sm)] bg-[var(--bg-1)] border border-[var(--border)] text-[var(--text-xs)]">
            <Clock className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span className="font-mono font-medium text-[var(--fg-0)]">{formatTimer(timerSeconds)}</span>
            <button
              type="button"
              onClick={() => setTimerRunning(!timerRunning)}
              className="px-2 py-0.5 rounded-[var(--radius-xs)] bg-[var(--accent)] text-[var(--accent-fg)] text-[10px] font-medium hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
            >
              {timerRunning ? "Pause" : "Focus Sprint"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTimerRunning(false);
                setTimerSeconds(25 * 60);
              }}
              className="text-[var(--fg-2)] hover:text-[var(--fg-0)] text-[10px] cursor-pointer"
            >
              Reset
            </button>
          </div>

          <Button variant="primary" onClick={() => setShowSubjectModal(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Subject
          </Button>
        </div>
      </div>

      {/* Keystroke Fatigue Indicator - compact mode in header */}
      {fatigue.showWarning && (
        <div className="mb-1">
          <KeystrokeFatigueIndicator fatigue={fatigue} compact={true} onDismiss={() => resetSession()} />
        </div>
      )}

      {state.error && (
        <div className="rounded-[var(--radius-sm)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-2.5 text-[var(--text-xs)] text-[var(--danger)]">
          {state.error}
        </div>
      )}

      {/* ── Clean Unified Mode Navigation Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2 shrink-0">
        <div className="flex items-center gap-1 bg-[var(--bg-1)] p-0.5 rounded-[var(--radius-sm)] border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setViewMode("topics")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-xs)] text-[var(--text-xs)] font-medium transition-colors cursor-pointer ${
              viewMode === "topics"
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)]"
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Syllabus & Topics</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("fsrs")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-xs)] text-[var(--text-xs)] font-medium transition-colors cursor-pointer ${
              viewMode === "fsrs"
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)]"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>FSRS Flashcards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("dag")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-xs)] text-[var(--text-xs)] font-medium transition-colors cursor-pointer ${
              viewMode === "dag"
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)]"
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            <span>Syllabus DAG</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("constellation")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-xs)] text-[var(--text-xs)] font-medium transition-colors cursor-pointer ${
              viewMode === "constellation"
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)]"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Star-Map</span>
          </button>

          {/* Interactive Labs Dropdown */}
          <div className="relative inline-flex items-center pl-1 border-l border-[var(--border-subtle)]">
            <select
              value={["bossfight", "socratic", "physics", "trap"].includes(viewMode) ? viewMode : "bossfight"}
              onChange={(e) => setViewMode(e.target.value as any)}
              className={`h-[28px] px-2 rounded-[var(--radius-xs)] text-[var(--text-xs)] font-medium outline-none cursor-pointer transition-colors ${
                ["bossfight", "socratic", "physics", "trap"].includes(viewMode)
                  ? "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]"
                  : "bg-transparent text-[var(--fg-2)] hover:text-[var(--fg-0)]"
              }`}
            >
              <option value="bossfight">⚔️ Boss Fight Arena</option>
              <option value="socratic">🧠 Socratic Math Scratchpad</option>
              <option value="physics">⚡ Physics Arena</option>
              <option value="trap">⚠️ Trap Questions</option>
            </select>
          </div>
        </div>

        {/* Selected Subject Quick Pill */}
        {state.selectedSubject && (
          <div className="hidden md:flex items-center gap-2 text-[var(--text-xs)] text-[var(--fg-2)]">
            <span>
              Subject:{" "}
              <strong className="text-[var(--fg-0)] font-medium">
                {state.selectedSubject.name}
              </strong>
            </span>
            {daysUntilExam !== null && (
              <span
                className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold border ${
                  daysUntilExam > 0
                    ? "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]"
                    : "bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/30"
                }`}
              >
                {daysUntilExam > 0 ? `D-${daysUntilExam}` : "Target Today"}
              </span>
            )}
          </div>
        )}
      </div>

      {viewMode === "dag" && (
        <div className="flex-1 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)]">
          <DagGraphView className="h-full w-full" />
        </div>
      )}

      {viewMode === "constellation" && (
        <div className="flex-1 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)]">
          <ConstellationMap subjects={constellationData} />
        </div>
      )}

      {viewMode === "fsrs" && (
        <div className="flex-1 overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
          <FSRSReview
            subjectId={state.selectedSubject?.id ?? (state.subjects[0]?.id || 1)}
            subjectName={state.selectedSubject?.name ?? (state.subjects[0]?.name || "Physics")}
            onBack={() => setViewMode("topics")}
          />
        </div>
      )}

      {viewMode === "bossfight" && (
        <div className="flex-1 overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)]">
          <BossFightArena />
        </div>
      )}

      {viewMode === "physics" && (
        <div className="flex-1 overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
          <PhysicsArena />
        </div>
      )}

      {viewMode === "socratic" && (
        <div className="flex flex-1 flex-col lg:flex-row gap-4 overflow-auto">
          <div className="flex-1 flex flex-col gap-4">
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)] p-4 shadow-xs">
              <h2 className="text-[var(--text-sm)] font-semibold mb-2 text-[var(--fg-0)]">Math Scratchpad (LaTeX)</h2>
              <textarea
                value={latexCode}
                onChange={(e) => setLatexCode(e.target.value)}
                className="w-full h-32 font-mono text-xs rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--bg-0)] p-2.5 outline-hidden text-[var(--fg-0)]"
              />
            </div>
            <SocraticAuditor latexContent={latexCode} />
          </div>
          <div className="flex-1 overflow-auto">
            <ScrubbableMath
              variables={demoVars}
              formulas={demoFormulas}
              onVariableChange={(id, val) => {
                setDemoVars((prev) => prev.map((v) => (v.id === id ? { ...v, value: val } : v)));
              }}
            />
          </div>
        </div>
      )}

      {viewMode === "trap" && (
        <div className="flex-1 overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)] p-4">
          <TrapQuestionsView
            subject={state.selectedSubject?.name}
            onBack={() => setViewMode("topics")}
          />
        </div>
      )}

      {viewMode === "topics" && (
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Subjects sidebar */}
        <div className="w-64 flex-shrink-0 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)] p-3">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-[var(--fg-2)]">
            Subjects
          </h2>
          {state.subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSubject(s)}
              className={`mb-1.5 w-full rounded-[var(--radius-sm)] p-2.5 text-left transition-colors cursor-pointer border ${
                state.selectedSubject?.id === s.id
                  ? "bg-[var(--accent-soft)] border-[var(--accent-border)] ring-1 ring-[var(--accent)]"
                  : "bg-[var(--bg-0)] border-[var(--border-subtle)] hover:bg-[var(--bg-2)]"
              }`}
            >
              <div className="flex items-center gap-2">
                {s.color && (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: s.color }}
                  />
                )}
                <span className="font-medium text-[var(--text-sm)] text-[var(--fg-0)]">{s.name}</span>
              </div>
              {s.targetDate && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--fg-2)]">
                  <Clock className="h-3 w-3 stroke-[1.5]" /> {s.targetDate}
                </div>
              )}
              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="text-[var(--fg-2)]">{s.topicCount} topics</span>
                <span
                  className="font-medium font-mono text-[11px]"
                  style={{ color: s.avgProgress === 100 ? "var(--success)" : s.avgProgress > 50 ? "var(--accent)" : "var(--warning)" }}
                >
                  {s.avgProgress}%
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-[var(--bg-2)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${s.avgProgress}%`,
                    background: s.avgProgress === 100 ? "var(--success)" : "var(--accent)",
                  }}
                />
              </div>
            </button>
          ))}
          {state.subjects.length === 0 && (
            <p className="py-8 text-center text-[var(--text-xs)] text-[var(--fg-2)]">No subjects yet</p>
          )}
        </div>

        {/* Topics + logs */}
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          {state.selectedSubject ? (
            <>
              {/* Subject Banner Card */}
              <div className="flex items-center justify-between p-3 rounded-[var(--radius-md)] bg-[var(--bg-1)] border border-[var(--border)]">
                <div>
                  <h2 className="text-[var(--text-md)] font-semibold text-[var(--fg-0)]">
                    {state.selectedSubject.name}
                  </h2>
                  <div className="flex items-center gap-3 text-[11px] text-[var(--fg-2)] mt-0.5">
                    {state.selectedSubject.targetDate && (
                      <span>Target: {state.selectedSubject.targetDate}</span>
                    )}
                    <span>&middot;</span>
                    <span>{totalStudyHrs}h total study logged</span>
                    <span>&middot;</span>
                    <span>{state.topics.length} topics tracked</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setShowLogModal(true)}>
                    <Clock className="mr-1 h-3.5 w-3.5" /> Log Study
                  </Button>
                  <Button variant="primary" onClick={() => setShowTopicModal(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Topic
                  </Button>
                </div>
              </div>

              <div className="flex flex-1 gap-4 overflow-hidden min-h-0">
                {/* Topics list */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  <div className="flex items-center justify-between pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--fg-2)]">
                    <span>Topics ({state.topics.length})</span>
                    <span>Mastery Rating</span>
                  </div>
                  {state.topics.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-[var(--radius-sm)] border transition-all ${
                        state.selectedTopic?.id === t.id
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] bg-[var(--bg-1)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[var(--text-sm)] text-[var(--fg-0)]">{t.name}</span>
                        <span className="text-[11px] text-[var(--fg-2)]">{t.dueDate ? `Due: ${t.dueDate}` : "No deadline"}</span>
                      </div>
                      <div className="mt-2.5 flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={t.progressPct}
                          onChange={(e) => {
                            const newPct = Number(e.target.value);
                            setState((s) => ({
                              ...s,
                              topics: s.topics.map((top) =>
                                top.id === t.id ? { ...top, progressPct: newPct } : top
                              ),
                            }));
                          }}
                          className="flex-1 accent-[var(--accent)] cursor-pointer"
                        />
                        <span className="w-9 text-right font-mono text-[11px] font-medium text-[var(--fg-1)]">
                          {t.progressPct}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 rounded-full bg-[var(--bg-inset)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${t.progressPct}%`,
                            background: t.progressPct === 100 ? "var(--success)" : "var(--accent)",
                          }}
                        />
                      </div>
                      {t.logCount > 0 && (
                        <p className="mt-1.5 text-[10px] text-[var(--fg-2)]">{t.logCount} study sessions logged</p>
                      )}
                    </div>
                  ))}
                  {state.topics.length === 0 && (
                    <div className="p-8 text-center rounded-[var(--radius-md)] border border-dashed border-[var(--border)] text-[var(--text-xs)] text-[var(--fg-2)]">
                      No topics added yet. Click &quot;Add Topic&quot; to outline your syllabus.
                    </div>
                  )}
                </div>

                {/* Study logs */}
                <div className="w-60 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-1)] p-3 shrink-0">
                  <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--fg-2)]">
                    Recent Logs
                  </h3>
                  {state.logs.slice(0, 10).map((log) => (
                    <div key={log.id} className="mb-2.5 pb-2 border-b border-[var(--border-subtle)] last:border-0">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--fg-1)]">
                        <Clock className="h-3 w-3 text-[var(--accent)] stroke-[1.5]" />
                        <span>{log.durationMin} minutes</span>
                      </div>
                      {log.note && (
                        <p className="truncate text-[11px] text-[var(--fg-2)] mt-0.5">{log.note}</p>
                      )}
                      <p className="text-[10px] text-[var(--fg-3)] mt-0.5">
                        {new Date(log.startedAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                  {state.logs.length === 0 && (
                    <p className="py-6 text-center text-[var(--text-xs)] text-[var(--fg-2)]">No study logs yet</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[var(--fg-2)]">
              <div className="text-center">
                <BookOpen className="mx-auto h-8 w-8 text-[var(--fg-3)] stroke-[1.5]" />
                <p className="mt-2 text-[var(--text-sm)]">Select a subject from the left panel</p>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Create Subject Modal */}
      <Modal open={showSubjectModal} onClose={() => setShowSubjectModal(false)} title="New Subject">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Name *</label>
            <Input
              value={subjectForm.name}
              onChange={(e) => setSubjectForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Mathematics"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Target Date</label>
            <Input
              type="date"
              value={subjectForm.targetDate}
              onChange={(e) => setSubjectForm((f) => ({ ...f, targetDate: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Color</label>
            <Input
              type="color"
              value={subjectForm.color}
              onChange={(e) => setSubjectForm((f) => ({ ...f, color: e.target.value }))}
              className="h-8"
            />
          </div>
          <Button variant="primary" className="w-full" onClick={handleCreateSubject}>
            Create Subject
          </Button>
        </div>
      </Modal>

      {/* Create Topic Modal */}
      <Modal open={showTopicModal} onClose={() => setShowTopicModal(false)} title="New Topic">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Topic Name *</label>
            <Input
              value={topicForm.name}
              onChange={(e) => setTopicForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Algebra"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Due Date</label>
            <Input
              type="date"
              value={topicForm.dueDate}
              onChange={(e) => setTopicForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </div>
          <Button variant="primary" className="w-full" onClick={handleCreateTopic}>
            Add Topic
          </Button>
        </div>
      </Modal>

      {/* Create Log Modal */}
      <Modal open={showLogModal} onClose={() => setShowLogModal(false)} title="Log Study Session">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Duration (min)</label>
            <Input
              type="number"
              value={logForm.durationMin}
              onChange={(e) => setLogForm((f) => ({ ...f, durationMin: Number(e.target.value) }))}
              min={1}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">Notes</label>
            <Input
              value={logForm.note}
              onChange={(e) => setLogForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="What did you study?"
            />
          </div>
          <Button variant="primary" className="w-full" onClick={handleCreateLog}>
            Save Log
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// Trap Questions View Component
function TrapQuestionsView({ subject, onBack }: { subject?: string; onBack: () => void }) {
  const [question, setQuestion] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [showExplanation, setShowExplanation] = React.useState(false);
  const [userAnswer, setUserAnswer] = React.useState<"A" | "B" | "C" | "D" | null>(null);

  const fetchQuestion = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (subject) params.set("subject", subject);
      params.set("explain", "true");
      const res = await fetch(`/api/exam-trap?${params}`);
      const data = await res.json();
      setQuestion(data.question);
      setShowExplanation(false);
      setUserAnswer(null);
    } catch (e) {
      console.error("Failed to fetch trap question:", e);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchQuestion();
  }, [subject]);

  const handleAnswer = (optionId: "A" | "B" | "C" | "D") => {
    setUserAnswer(optionId);
    setShowExplanation(true);
  };

  if (!question && !loading) return (
    <div className="flex items-center justify-center h-full text-zinc-400">
      <p>No trap questions available</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">IIT Professor Trap Questions</h2>
        <Button variant="secondary" className="text-xs px-2 py-1" onClick={onBack}>
          Back to Topics
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-500 border-t-transparent" />
        </div>
      ) : question && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300">
                {question.difficulty}
              </span>
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300">
                {question.subject}
              </span>
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
                {question.topic}
              </span>
            </div>
            <div className="prose prose-zinc dark:prose-invert max-w-none text-base">
              {question.problemStatement.split('\n').map((line: string, i: number) => (
                <p key={i} className="my-1">{line}</p>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {question.options.map((opt: any) => (
              <button
                key={opt.id}
                onClick={() => !showExplanation && handleAnswer(opt.id)}
                disabled={showExplanation}
                className={`rounded-xl border p-4 text-left transition-all ${
                  showExplanation
                    ? opt.isCorrect
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                      : opt.id === userAnswer
                      ? "border-rose-500 bg-rose-50 dark:bg-rose-950/30"
                      : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-violet-300 dark:hover:border-violet-700"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm ${
                    showExplanation
                      ? opt.isCorrect
                        ? "bg-emerald-500 text-white"
                        : opt.id === userAnswer
                        ? "bg-rose-500 text-white"
                        : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                      : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                  }`}>
                    {opt.id}
                  </span>
                  <div className="flex-1">
                    <p className="text-zinc-900 dark:text-zinc-100">{opt.text}</p>
                    {showExplanation && opt.cognitivePitfall && (
                      <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">⚠ {opt.cognitivePitfall}</p>
                    )}
                    {showExplanation && opt.trapType && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">🎯 {opt.trapType}</p>
                    )}
                  </div>
                  {showExplanation && opt.isCorrect && (
                    <span className="text-emerald-500">✓</span>
                  )}
                  {showExplanation && opt.id === userAnswer && !opt.isCorrect && (
                    <span className="text-rose-500">✗</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {showExplanation && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Conceptual Breakdown</h3>
              <div className="prose prose-zinc dark:prose-invert max-w-none text-sm">
                {question.conceptualBreakdown.split('\n').map((line: string, i: number) => (
                  <p key={i} className="my-1">{line}</p>
                ))}
              </div>

              <div className="rounded-lg bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 p-4">
                <h4 className="font-semibold text-cyan-700 dark:text-cyan-300 mb-2">💡 Shortcut Trick</h4>
                <p className="text-cyan-600 dark:text-cyan-400 text-sm">{question.shortcutTrick}</p>
              </div>

              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
                <h4 className="font-semibold text-amber-700 dark:text-amber-300 mb-2">🧠 Misconceptions Targeted</h4>
                <ul className="list-disc list-inside text-sm text-amber-600 dark:text-amber-400 space-y-1">
                  {question.misconceptionsTargeted.map((m: string, i: number) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>

              <Button variant="primary" onClick={fetchQuestion} className="w-full">
                Next Trap Question
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
