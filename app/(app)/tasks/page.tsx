import { TasksApp } from "@/components/tasks/TasksApp";

/**
 * P5: tasks — kanban board (drag → PATCH), Gantt with dependency links,
 * list view, detail panel with time tracker + task_deps edges.
 * Rule: a task can't complete while its prerequisites are open
 * (client block + API 409 `blocked_by_dependencies`).
 */
export default function TasksPage() {
  return <TasksApp />;
}