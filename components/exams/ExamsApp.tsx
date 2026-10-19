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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg">×</button>
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

  return (
    <div className="flex h-full flex-col gap-4 p-5 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Exam Prep</h1>
        <Button variant="primary" onClick={() => setShowSubjectModal(true)}>
          <Plus className="mr-1 h-4 w-4" /> New Subject
        </Button>
      </div>

      {/* Keystroke Fatigue Indicator - compact mode in header */}
      {fatigue.showWarning && (
        <div className="mb-2">
          <KeystrokeFatigueIndicator fatigue={fatigue} compact={true} onDismiss={() => resetSession()} />
        </div>
      )}

      {state.error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </div>
      )}

      {/* Mode navigation bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <button
          onClick={() => setViewMode("topics")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            viewMode === "topics"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>Syllabus & Topics</span>
        </button>
        <button
          onClick={() => setViewMode("constellation")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            viewMode === "constellation"
              ? "bg-cyan-600 text-white shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Constellation Star-Map</span>
        </button>
        <button
          onClick={() => setViewMode("fsrs")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            viewMode === "fsrs"
              ? "bg-indigo-600 text-white shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>FSRS Flashcards</span>
        </button>
        <button
          onClick={() => setViewMode("bossfight")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            viewMode === "bossfight"
              ? "bg-rose-600 text-white shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <Swords className="h-3.5 w-3.5" />
          <span>AIR 1 Boss Fight</span>
        </button>
        <button
          onClick={() => setViewMode("socratic")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            viewMode === "socratic"
              ? "bg-purple-600 text-white shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <Brain className="h-3.5 w-3.5" />
          <span>Socratic Ghost & Math</span>
        </button>
        <button
          onClick={() => setViewMode("physics")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            viewMode === "physics"
              ? "bg-emerald-600 text-white shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          <span>Physics Arena</span>
        </button>
        <button
          onClick={() => setViewMode("dag")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            viewMode === "dag"
              ? "bg-amber-600 text-white shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <Network className="h-3.5 w-3.5" />
          <span>Syllabus DAG (CPM)</span>
        </button>
        <button
          onClick={() => setViewMode("trap")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            viewMode === "trap"
              ? "bg-violet-600 text-white shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Trap Questions</span>
        </button>
      </div>

      {viewMode === "dag" && (
        <div className="flex-1 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <DagGraphView className="h-full w-full" />
        </div>
      )}

      {viewMode === "constellation" && (
        <div className="flex-1 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <ConstellationMap subjects={constellationData} />
        </div>
      )}

      {viewMode === "fsrs" && (
        <div className="flex-1 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <FSRSReview
            subjectId={state.selectedSubject?.id ?? (state.subjects[0]?.id || 1)}
            subjectName={state.selectedSubject?.name ?? (state.subjects[0]?.name || "Physics")}
            onBack={() => setViewMode("topics")}
          />
        </div>
      )}

      {viewMode === "bossfight" && (
        <div className="flex-1 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <BossFightArena />
        </div>
      )}

      {viewMode === "physics" && (
        <div className="flex-1 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <PhysicsArena />
        </div>
      )}

      {viewMode === "socratic" && (
        <div className="flex flex-1 flex-col lg:flex-row gap-4 overflow-auto">
          <div className="flex-1 flex flex-col gap-4">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xs">
              <h2 className="text-sm font-semibold mb-2 text-zinc-900 dark:text-zinc-100">Math Scratchpad (LaTeX)</h2>
              <textarea
                value={latexCode}
                onChange={(e) => setLatexCode(e.target.value)}
                className="w-full h-32 font-mono text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2.5 outline-hidden text-zinc-900 dark:text-zinc-100"
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
        <div className="flex-1 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <TrapQuestionsView
            subject={state.selectedSubject?.name}
            onBack={() => setViewMode("topics")}
          />
        </div>
      )}

      {viewMode === "topics" && (
      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Subjects sidebar */}
        <div className="w-64 flex-shrink-0 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Subjects
          </h2>
          {state.subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSubject(s)}
              className={`mb-1 w-full rounded-lg p-3 text-left transition-colors cursor-pointer ${
                state.selectedSubject?.id === s.id
                  ? "bg-blue-50 ring-1 ring-blue-300 dark:bg-blue-950/40 dark:ring-blue-800"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center gap-2">
                {s.color && (
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: s.color }}
                  />
                )}
                <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{s.name}</span>
              </div>
              {s.targetDate && (
                <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <Clock className="h-3 w-3" /> {s.targetDate}
                </div>
              )}
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-zinc-500 dark:text-zinc-400">{s.topicCount} topics</span>
                <span
                  className="font-medium"
                  style={{ color: s.avgProgress === 100 ? "#10b981" : s.avgProgress > 50 ? "#f59e0b" : "#ef4444" }}
                >
                  {s.avgProgress}%
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${s.avgProgress}%`,
                    background: s.avgProgress === 100 ? "#10b981" : s.avgProgress > 50 ? "#f59e0b" : "#ef4444",
                  }}
                />
              </div>
            </button>
          ))}
          {state.subjects.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">No subjects yet</p>
          )}
        </div>

        {/* Topics + logs */}
        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          {state.selectedSubject ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{state.selectedSubject.name}</h2>
                  {state.selectedSubject.targetDate && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Target: {state.selectedSubject.targetDate} · {totalStudyHrs}h studied
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setShowLogModal(true)}>
                    <Clock className="mr-1 h-4 w-4" /> Log Study
                  </Button>
                  <Button variant="primary" onClick={() => setShowTopicModal(true)}>
                    <Plus className="mr-1 h-4 w-4" /> Add Topic
                  </Button>
                </div>
              </div>

              <div className="flex flex-1 gap-4 overflow-hidden">
                {/* Topics list */}
                <div className="flex-1 overflow-y-auto">
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Topics ({state.topics.length})
                  </h3>
                  {state.topics.map((t) => (
                    <div
                      key={t.id}
                      className={`mb-2 rounded-lg border p-3 ${
                        state.selectedTopic?.id === t.id
                          ? "border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/40"
                          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{t.name}</span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{t.dueDate ?? "No due date"}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={t.progressPct}
                          onChange={(e) => {
                            // Optimistic update
                            const newPct = Number(e.target.value);
                            setState((s) => ({
                              ...s,
                              topics: s.topics.map((top) =>
                                top.id === t.id ? { ...top, progressPct: newPct } : top,
                              ),
                            }));
                          }}
                          className="flex-1"
                        />
                        <span className="w-8 text-right text-xs font-medium text-zinc-700 dark:text-zinc-300">{t.progressPct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className="h-1.5 rounded-full bg-blue-500 transition-all"
                          style={{ width: `${t.progressPct}%` }}
                        />
                      </div>
                      {t.logCount > 0 && (
                        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{t.logCount} study sessions</p>
                      )}
                    </div>
                  ))}
                  {state.topics.length === 0 && (
                    <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
                      No topics — add one to get started
                    </p>
                  )}
                </div>

                {/* Study logs */}
                <div className="w-56 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Recent Logs
                  </h3>
                  {state.logs.slice(0, 10).map((log) => (
                    <div key={log.id} className="mb-2 border-b border-zinc-100 dark:border-zinc-800 pb-2 last:border-0">
                      <div className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                        <Clock className="h-3 w-3" />
                        <span>{log.durationMin}min</span>
                      </div>
                      {log.note && (
                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{log.note}</p>
                      )}
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        {new Date(log.startedAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                  {state.logs.length === 0 && (
                    <p className="py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">No study logs yet</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-zinc-400 dark:text-zinc-500">
              <div className="text-center">
                <BookOpen className="mx-auto h-10 w-10 opacity-30" />
                <p className="mt-2 text-sm">Select a subject to view topics</p>
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
