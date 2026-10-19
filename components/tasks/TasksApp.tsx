"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Plus, Columns3, GanttChart as GanttIcon, List, Network } from "lucide-react";
import type { TaskRow } from "@/lib/tracking-service";
import { trackingApi, ApiError } from "@/lib/tracking-client";
import { KanbanBoard } from "./KanbanColumn";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GanttView = dynamic(() => import("./GanttView").then((m) => m.GanttChart), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-zinc-400">Loading Gantt…</div>,
});

const DagGraphView = dynamic(() => import("./DagGraphView").then((m) => m.DagGraphView), {
  ssr: false,
  loading: () => <div className="p-8 text-sm text-zinc-400">Loading CPM Graph…</div>,
});

type View = "board" | "gantt" | "list" | "cpm";

export function TasksApp() {
  const [view, setView] = React.useState<View>("board");
  const [projects, setProjects] = React.useState<{ id: number; title: string }[]>(
    [],
  );
  const [tasks, setTasks] = React.useState<TaskRow[]>([]);
  const [depPairs, setDepPairs] = React.useState<[number, number][]>([]);
  const [projectFilter, setProjectFilter] = React.useState<string>("");
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [banner, setBanner] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // create-task row
  const [newTitle, setNewTitle] = React.useState("");
  const [newProject, setNewProject] = React.useState("");
  const [newPriority, setNewPriority] = React.useState(1);

  const reload = React.useCallback(() => {
    Promise.all([
      trackingApi.listProjects(),
      trackingApi.listTasks({ limit: 500 }),
      trackingApi.listTaskDeps(),
    ])
      .then(([p, t, d]) => {
        setProjects(p.projects.map((x) => ({ id: x.id, title: x.title })));
        setTasks(t.tasks);
        setDepPairs(d.deps.map((e) => [e.taskId, e.blocksTaskId] as const));
      })
      .catch((e) => setBanner(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  /** Client-side P5 rule: open (non-done) prerequisites per task, from bulk pairs. */
  const openBlockers = React.useMemo(() => {
    const open = new Map<number, string>();
    for (const t of tasks) if (t.status !== "done") open.set(t.id, t.title);
    const out: Record<number, string[]> = {};
    for (const [blockerId, blockedId] of depPairs) {
      const title = open.get(blockerId);
      if (title) (out[blockedId] ??= []).push(title);
    }
    return out;
  }, [tasks, depPairs]);

  async function onTaskMove(taskId: number, newStatus: TaskRow["status"]) {
    setBanner(null);
    if (newStatus === "done") {
      const blockers = openBlockers[taskId];
      if (blockers && blockers.length > 0) {
        setBanner(`Blocked: complete "${blockers.join(", ")}" first.`);
        return;
      }
    }
    try {
      await trackingApi.updateTask(taskId, { status: newStatus });
      await reload();
    } catch (e) {
      if (e instanceof ApiError && e.code === "blocked_by_dependencies") {
        const blocking =
          (e.details?.blocking as { title: string }[] | undefined) ?? [];
        setBanner(
          `Cannot complete task — blocked by: ${
            blocking.map((b) => b.title).join(", ") || "open prerequisites"
          }`,
        );
        return;
      }
      setBanner(e instanceof Error ? e.message : "Move failed");
    }
  }

  async function createTask() {
    const title = newTitle.trim();
    if (!title) return;
    setBanner(null);
    try {
      await trackingApi.createTask({
        title,
        projectId: newProject ? Number(newProject) : null,
        priority: newPriority,
      });
      setNewTitle("");
      await reload();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Create failed");
    }
  }

  const selected = selectedId
    ? tasks.find((t) => t.id === selectedId)
    : undefined;

  const filtered = projectFilter
    ? tasks.filter((t) => String(t.projectId ?? "") === projectFilter)
    : tasks;

  const columns = [
    { status: "todo" as const, title: "To Do", tasks: [] as TaskRow[] },
    { status: "doing" as const, title: "In Progress", tasks: [] as TaskRow[] },
    { status: "done" as const, title: "Done", tasks: [] as TaskRow[] },
  ];
  for (const c of columns) c.tasks = filtered.filter((t) => t.status === c.status);

  const taskDagNodes = React.useMemo(() => {
    if (filtered.length === 0) return undefined;
    const prereqMap: Record<number, string[]> = {};
    for (const [blocker, blocked] of depPairs) {
      (prereqMap[blocked] ??= []).push(String(blocker));
    }
    return filtered.map((t) => ({
      id: String(t.id),
      name: t.title,
      durationHours: Math.max(2, (t.priority + 1) * 3),
      progressPct: t.status === "done" ? 100 : t.status === "doing" ? 50 : 0,
      prerequisites: prereqMap[t.id] ?? [],
    }));
  }, [filtered, depPairs]);

  return (
    <div className="flex h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Tasks</h1>
          <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900 p-0.5">
            {(["board", "gantt", "cpm", "list"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
                  view === v
                    ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {v === "board" && <Columns3 className="h-3 w-3" />}
                {v === "gantt" && <GanttIcon className="h-3 w-3" />}
                {v === "cpm" && <Network className="h-3 w-3" />}
                {v === "list" && <List className="h-3 w-3" />}
                {v === "cpm" ? "CPM Graph" : v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-md border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 outline-none"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void createTask()}
              placeholder="New task…"
              className="w-52"
            />
            <select
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
              className="rounded-md border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-2 text-xs text-zinc-700 dark:text-zinc-200 outline-none"
            >
              <option value="">no project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(Number(e.target.value))}
              className="rounded-md border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-2 text-xs text-zinc-700 dark:text-zinc-200 outline-none"
            >
              <option value={0}>Low</option>
              <option value={1}>Normal</option>
              <option value={2}>High</option>
              <option value={3}>Urgent</option>
            </select>
            <Button onClick={() => void createTask()} className="px-2.5 py-2">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {banner && (
          <div className="mb-3 rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-800 dark:text-amber-300">
            {banner}
          </div>
        )}

        {view === "board" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <KanbanBoard
              columns={columns}
              blockedCounts={openBlockers}
              onTaskMove={onTaskMove}
              onTaskClick={(t) => setSelectedId(t.id)}
            />
          </div>
        )}
        {view === "gantt" && (
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <GanttView
              tasks={filtered}
              depPairs={depPairs}
              onTaskClick={(t) => setSelectedId(t.id)}
            />
          </div>
        )}
        {view === "cpm" && (
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col">
            <DagGraphView
              initialNodes={taskDagNodes && taskDagNodes.length > 1 && depPairs.length > 0 ? taskDagNodes : undefined}
              className="h-full w-full"
              onSelectNode={(nodeId) => {
                const num = Number(nodeId);
                if (!isNaN(num)) setSelectedId(num);
              }}
            />
          </div>
        )}
        {view === "list" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              {filtered.map((t) => (
                <li
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <select
                    value={t.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      void onTaskMove(t.id, e.target.value as TaskRow["status"])
                    }
                    className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-700 dark:text-zinc-200"
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
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {projects.find((p) => p.id === t.projectId)?.title ?? "—"}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">P{t.priority}</span>
                  {t.dueDate && (
                    <span className="text-xs text-zinc-500">{t.dueDate}</span>
                  )}
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-zinc-400">
                  No tasks yet — add one above.
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {selected && (
        <TaskDetailPanel
          key={selected.id}
          task={selected}
          allTasks={tasks}
          projects={projects}
          onClose={() => setSelectedId(null)}
          onChanged={() => void reload()}
        />
      )}
    </div>
  );
}