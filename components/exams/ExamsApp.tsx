"use client";

import * as React from "react";
import { Plus, BookOpen, Clock, Trash2, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SubjectRow, TopicRow, StudyLogRow } from "@/lib/exam-service";

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

      {state.error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </div>
      )}

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
