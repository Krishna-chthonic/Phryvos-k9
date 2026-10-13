"use client";

import * as React from "react";
import { Play, Square, Timer, Trash2, Plus, Link2, X } from "lucide-react";
import type { TaskRow, TimeEntryRow } from "@/lib/tracking-service";
import { trackingApi, ApiError } from "@/lib/tracking-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

interface TaskDetailPanelProps {
  task: TaskRow;
  allTasks: TaskRow[];
  projects: { id: number; title: string }[];
  onClose: () => void;
  onChanged: () => void;
}

export function TaskDetailPanel({
  task,
  allTasks,
  projects,
  onClose,
  onChanged,
}: TaskDetailPanelProps) {
  const [busy, setBusy] = React.useState(false);
  const [title, setTitle] = React.useState(task.title);
  const [desc, setDesc] = React.useState(task.description ?? "");
  const [priority, setPriority] = React.useState(task.priority);
  const [dueDate, setDueDate] = React.useState(task.dueDate ?? "");
  const [tags, setTags] = React.useState(task.tags.join(", "));
  const [projectId, setProjectId] = React.useState(
    task.projectId?.toString() ?? "",
  );
  const [error, setError] = React.useState<string | null>(null);

  // deps
  const [deps, setDeps] = React.useState<{
    blockers: TaskRow[];
    blocked: TaskRow[];
  } | null>(null);
  const [pickBlocker, setPickBlocker] = React.useState("");
  const [pickBlocked, setPickBlocked] = React.useState("");

  // live time tracker
  const [timerStart, setTimerStart] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (timerStart === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timerStart]);
  const elapsed = timerStart ? Math.floor((now - timerStart) / 1000) : 0;

  // manual entry + list
  const [manualSec, setManualSec] = React.useState("");
  const [manualNote, setManualNote] = React.useState("");
  const [entries, setEntries] = React.useState<TimeEntryRow[]>([]);

  const refreshDeps = React.useCallback(async () => {
    try {
      const r = await trackingApi.getTaskDeps(task.id);
      setDeps(r.deps);
    } catch {
      /* panel is best-effort; main view reload will surface hard errors */
    }
  }, [task.id]);

  const refreshEntries = React.useCallback(async () => {
    try {
      const r = await trackingApi.listTimeEntries({ taskId: task.id, limit: 50 });
      setEntries(r.entries);
    } catch {
      /* ignore */
    }
  }, [task.id]);

  React.useEffect(() => {
    void refreshDeps();
    void refreshEntries();
  }, [refreshDeps, refreshEntries, task.updatedAt]);

  async function saveAll() {
    setBusy(true);
    setError(null);
    try {
      await trackingApi.updateTask(task.id, {
        title,
        description: desc,
        priority,
        dueDate: dueDate || null,
        tags: tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        projectId: projectId ? Number(projectId) : null,
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function addBlocker() {
    const x = Number(pickBlocker);
    if (!x) return;
    setError(null);
    try {
      await trackingApi.addTaskDep(x, task.id); // x blocks task.id
      setPickBlocker("");
      await refreshDeps();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add dependency");
    }
  }

  async function addBlocked() {
    const x = Number(pickBlocked);
    if (!x) return;
    setError(null);
    try {
      await trackingApi.addTaskDep(task.id, x); // task.id blocks x
      setPickBlocked("");
      await refreshDeps();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add dependency");
    }
  }

  async function removeDep(otherId: number, iAmBlocker: boolean) {
    setError(null);
    try {
      if (iAmBlocker) await trackingApi.removeTaskDep(task.id, otherId);
      else await trackingApi.removeTaskDep(otherId, task.id);
      await refreshDeps();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove dependency");
    }
  }

  async function stopTimer() {
    if (timerStart === null) return;
    const sec = Math.max(1, Math.round((Date.now() - timerStart) / 1000));
    setError(null);
    try {
      await trackingApi.addTimeEntry(task.id, { durationSec: sec });
      setTimerStart(null);
      await refreshEntries();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not log time");
    }
  }

  async function addManual() {
    const sec = Number(manualSec);
    if (!(sec > 0)) return;
    setError(null);
    try {
      await trackingApi.addTimeEntry(task.id, {
        durationSec: sec,
        note: manualNote || undefined,
      });
      setManualSec("");
      setManualNote("");
      await refreshEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add time entry");
    }
  }

  async function removeEntry(id: number) {
    setError(null);
    try {
      await trackingApi.deleteTimeEntry(task.id, id, task.id);
      await refreshEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete entry");
    }
  }

  async function removeTask() {
    setError(null);
    try {
      await trackingApi.deleteTask(task.id);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const totalSec = entries.reduce((n, e) => n + e.durationSec, 0);

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col overflow-y-auto border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Task <span className="text-zinc-400 dark:text-zinc-500">#{task.id}</span>
        </h2>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-800 dark:text-amber-300">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label>Description</Label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label>Priority</Label>
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
            >
              <option value={0}>Low</option>
              <option value={1}>Normal</option>
              <option value={2}>High</option>
              <option value={3}>Urgent</option>
            </select>
          </div>
          <div className="flex-1">
            <Label>Due</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label>Tags (comma)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="flex-1">
            <Label>Project</Label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none"
            >
              <option value="">— none —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button onClick={saveAll} disabled={busy} className="w-full">
          Save
        </Button>
      </div>

      {/* dependencies */}
      <div className="mt-6">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <Link2 className="h-3.5 w-3.5" /> Dependencies
        </div>
        {deps && (
          <div className="space-y-2 text-xs">
            {deps.blockers.length > 0 && (
              <div>
                <div className="mb-1 text-zinc-500 dark:text-zinc-400">Blocks this task:</div>
                <ul className="space-y-1">
                  {deps.blockers.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-2 py-1.5"
                    >
                      <span
                        className={
                          b.status === "done" ? "text-zinc-400 dark:text-zinc-500" : "text-amber-700 dark:text-amber-400"
                        }
                      >
                        {b.title}
                        {b.status === "done" ? " ✓" : ""}
                      </span>
                      <button
                        onClick={() => void removeDep(b.id, false)}
                        className="text-zinc-400 hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {deps.blocked.length > 0 && (
              <div>
                <div className="mb-1 text-zinc-500 dark:text-zinc-400">This task blocks:</div>
                <ul className="space-y-1">
                  {deps.blocked.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-2 py-1.5"
                    >
                      <span className="text-zinc-800 dark:text-zinc-200">{b.title}</span>
                      <button
                        onClick={() => void removeDep(b.id, true)}
                        className="text-zinc-400 hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {deps.blockers.length === 0 && deps.blocked.length === 0 && (
              <div className="text-zinc-400 dark:text-zinc-500">No dependencies.</div>
            )}
            <div className="flex gap-2 pt-2">
              <select
                value={pickBlocker}
                onChange={(e) => setPickBlocker(e.target.value)}
                className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-zinc-900 dark:text-zinc-100 outline-none"
              >
                <option value="">+ task that blocks…</option>
                {allTasks
                  .filter((t) => t.id !== task.id && t.status !== "done")
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
              <Button
                onClick={addBlocker}
                disabled={!pickBlocker}
                className="px-2.5 py-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex gap-2">
              <select
                value={pickBlocked}
                onChange={(e) => setPickBlocked(e.target.value)}
                className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1.5 text-zinc-900 dark:text-zinc-100 outline-none"
              >
                <option value="">+ task this one blocks…</option>
                {allTasks
                  .filter((t) => t.id !== task.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
              <Button
                onClick={addBlocked}
                disabled={!pickBlocked}
                className="px-2.5 py-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* time tracker */}
      <div className="mt-6">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <Timer className="h-3.5 w-3.5" /> Time
          <span className="ml-auto text-xs font-normal text-zinc-500 dark:text-zinc-400">
            total {fmtDur(totalSec)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {timerStart === null ? (
            <Button
              onClick={() => setTimerStart(Date.now())}
              className="px-2.5 py-1.5 text-xs"
            >
              <Play className="h-3.5 w-3.5" /> Start
            </Button>
          ) : (
            <Button
              onClick={stopTimer}
              className="bg-red-600 px-2.5 py-1.5 text-xs hover:bg-red-700"
            >
              <Square className="h-3.5 w-3.5" /> Stop ({fmtDur(elapsed)})
            </Button>
          )}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <Label>Manual (sec)</Label>
            <Input
              type="number"
              min={1}
              value={manualSec}
              onChange={(e) => setManualSec(e.target.value)}
              placeholder="1800"
            />
          </div>
          <div className="flex-1">
            <Label>Note</Label>
            <Input
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              placeholder="optional"
            />
          </div>
          <Button onClick={addManual} disabled={!Number(manualSec)} className="px-3">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {entries.length > 0 && (
          <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-md bg-zinc-50 dark:bg-zinc-800/60 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300"
              >
                <span>
                  {fmtDur(e.durationSec)}
                  {e.note ? ` — ${e.note}` : ""}
                  <span className="ml-1 text-zinc-400 dark:text-zinc-500">
                    {new Date(e.startedAt).toLocaleString()}
                  </span>
                </span>
                <button
                  onClick={() => void removeEntry(e.id)}
                  className="text-zinc-400 hover:text-red-500"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* danger zone */}
      <div className="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <Button
          onClick={removeTask}
          className="w-full justify-center bg-red-600 hover:bg-red-700 text-white"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete task
        </Button>
      </div>
    </aside>
  );
}