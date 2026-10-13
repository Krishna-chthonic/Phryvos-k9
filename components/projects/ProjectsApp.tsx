"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  Plus,
  Archive,
  Trash2,
  GanttChart as GanttIcon,
  List,
} from "lucide-react";
import type { ProjectRow, TaskRow } from "@/lib/tracking-service";
import { trackingApi, ApiError } from "@/lib/tracking-client";
import { GanttChart } from "@/components/tasks/GanttView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProjectsApp() {
  const [projects, setProjects] = React.useState<ProjectRow[]>([]);
  const [tasks, setTasks] = React.useState<TaskRow[]>([]);
  const [depPairs, setDepPairs] = React.useState<[number, number][]>([]);
  const [showArchived, setShowArchived] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [ptab, setPtab] = React.useState<"tasks" | "gantt">("tasks");
  const [banner, setBanner] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // new project form
  const [npTitle, setNpTitle] = React.useState("");
  const [npDesc, setNpDesc] = React.useState("");
  const [npStart, setNpStart] = React.useState("");
  const [npEnd, setNpEnd] = React.useState("");
  const [npColor, setNpColor] = React.useState("#3b82f6");

  const reload = React.useCallback(async (archived = false, sel: number | null = null) => {
    try {
      const [p, t, d] = await Promise.all([
        trackingApi.listProjects(archived),
        trackingApi.listTasks({ limit: 500 }),
        trackingApi.listTaskDeps(),
      ]);
      setProjects(p.projects);
      setTasks(t.tasks);
      setDepPairs(d.deps.map((e) => [e.taskId, e.blocksTaskId] as const));
      if (sel != null) setSelectedId(sel);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload(false, selectedId);
  }, [reload, selectedId]);

  async function createProject() {
    if (!npTitle.trim()) return;
    setBanner(null);
    try {
      const r = await trackingApi.createProject({
        title: npTitle.trim(),
        description: npDesc.trim() || null,
        color: npColor,
        startDate: npStart || null,
        endDate: npEnd || null,
      });
      setNpTitle("");
      setNpDesc("");
      setNpStart("");
      setNpEnd("");
      await reload(false, r.project.id);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function setProjectStatus(p: ProjectRow, status: "active" | "archived") {
    setBanner(null);
    try {
      await trackingApi.updateProject(p.id, { status });
      await reload(status === "archived", p.id);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function deleteProject(p: ProjectRow) {
    if (!confirm(`Delete project "${p.title}" and all its tasks?`)) return;
    setBanner(null);
    try {
      await trackingApi.deleteProject(p.id);
      if (selectedId === p.id) setSelectedId(null);
      await reload(false, null);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function setTaskStatus(t: TaskRow, status: TaskRow["status"]) {
    setBanner(null);
    try {
      await trackingApi.updateTask(t.id, { status });
      await reload(showArchived, selectedId);
    } catch (e) {
      if (e instanceof ApiError && e.code === "blocked_by_dependencies") {
        const blocking =
          (e.details?.blocking as { title: string }[] | undefined) ?? [];
        setBanner(
          `Cannot complete — blocked by: ${
            blocking.map((b) => b.title).join(", ") || "open prerequisites"
          }`,
        );
      } else {
        setBanner(e instanceof Error ? e.message : "Update failed");
      }
    }
  }

  const selected = projects.find((p) => p.id === selectedId);
  const projTasks = selected ? tasks.filter((t) => t.projectId === selected.id) : [];
  const projDeps = depPairs.filter(
    ([a, b]) =>
      projTasks.some((t) => t.id === a) && projTasks.some((t) => t.id === b),
  );

  if (loading)
    return <div className="p-10 text-sm text-zinc-400">Loading projects…</div>;

  return (
    <div className="flex h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Projects</h1>
          <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => {
                setShowArchived(e.target.checked);
                void reload(e.target.checked, selectedId);
              }}
              className="accent-zinc-900 dark:accent-zinc-100"
            />
            show archived
          </label>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="color"
              value={npColor}
              onChange={(e) => setNpColor(e.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              title="Project color"
            />
            <Input
              value={npStart}
              type="date"
              onChange={(e) => setNpStart(e.target.value)}
              className="w-36"
              title="Start date"
            />
            <Input
              value={npEnd}
              type="date"
              onChange={(e) => setNpEnd(e.target.value)}
              className="w-36"
              title="End date"
            />
            <Input
              value={npTitle}
              onChange={(e) => setNpTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void createProject()}
              placeholder="New project…"
              className="w-52"
            />
            <Input
              value={npDesc}
              onChange={(e) => setNpDesc(e.target.value)}
              placeholder="description (optional)"
              className="w-48"
            />
            <Button onClick={() => void createProject()} className="px-2.5">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {banner && (
          <div className="mb-3 rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-800 dark:text-amber-300">
            {banner}
          </div>
        )}

        <div
          className="grid min-h-0 flex-1 gap-4"
          style={{ gridTemplateColumns: "320px 1fr" }}
        >
          <div className="space-y-2 overflow-y-auto pr-1">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                  p.id === selectedId
                    ? "border-zinc-300 bg-zinc-100/90 shadow-2xs dark:border-zinc-700 dark:bg-zinc-800"
                    : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                } ${p.status === "archived" ? "opacity-60" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: p.color ?? "#a1a1aa" }}
                  />
                  <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {p.title}
                  </span>
                </div>
                {p.description && (
                  <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {p.description}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span>
                    {p.doneCount}/{p.taskCount} tasks
                  </span>
                  <div className="h-1 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full bg-zinc-800 dark:bg-zinc-300"
                      style={{
                        width: p.taskCount
                          ? `${Math.round((p.doneCount / p.taskCount) * 100)}%`
                          : "0%",
                      }}
                    />
                  </div>
                  {p.startDate && <span>{p.startDate}</span>}
                  {p.endDate && <span>→ {p.endDate}</span>}
                </div>
              </button>
            ))}
            {projects.length === 0 && (
              <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 p-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
                No projects yet.
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
            {selected ? (
              <>
                <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 p-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {selected.title}
                    </h2>
                    {selected.description && (
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {selected.description}
                      </p>
                    )}
                  </div>
                  <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900 p-0.5">
                    {(["tasks", "gantt"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setPtab(v)}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                          ptab === v
                            ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100"
                            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                        }`}
                      >
                        {v === "tasks" ? (
                          <List className="h-3 w-3" />
                        ) : (
                          <GanttIcon className="h-3 w-3" />
                        )}
                        {v}
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={() =>
                      void setProjectStatus(selected, selected.status === "active" ? "archived" : "active")
                    }
                    variant="secondary"
                    className="px-2 py-1.5 text-xs"
                    title={selected.status === "active" ? "Archive" : "Unarchive"}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    onClick={() => void deleteProject(selected)}
                    variant="destructive"
                    className="px-2 py-1.5 text-xs"
                    title="Delete project and tasks"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {ptab === "tasks" ? (
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {projTasks.map((t) => (
                        <li key={t.id} className="flex items-center gap-3 py-2">
                          <select
                            value={t.status}
                            onChange={(e) =>
                              void setTaskStatus(t, e.target.value as TaskRow["status"])
                            }
                            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-700 dark:text-zinc-200 outline-none"
                          >
                            <option value="todo">todo</option>
                            <option value="doing">doing</option>
                            <option value="done">done</option>
                          </select>
                          <span
                            className={`flex-1 truncate text-sm ${
                              t.status === "done"
                                ? "text-zinc-400 dark:text-zinc-500 line-through"
                                : "text-zinc-900 dark:text-zinc-100"
                            }`}
                          >
                            {t.title}
                          </span>
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">P{t.priority}</span>
                          {t.dueDate && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">{t.dueDate}</span>
                          )}
                        </li>
                      ))}
                      {projTasks.length === 0 && (
                        <li className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
                          No tasks in this project.
                        </li>
                      )}
                    </ul>
                  ) : (
                    <GanttChart
                      tasks={projTasks}
                      depPairs={projDeps}
                      onTaskClick={() => {}}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
                Select a project.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}