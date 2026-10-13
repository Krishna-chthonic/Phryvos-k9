"use client";

import * as React from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import type { TaskRow } from "@/lib/tracking-service";
import { TaskCard } from "./TaskCard";

interface KanbanColumnProps {
  status: TaskRow["status"];
  title: string;
  tasks: TaskRow[];
  blockedCounts: Record<number, string[]>;
  onTaskMove: (taskId: number, newStatus: TaskRow["status"]) => void;
  onTaskClick: (task: TaskRow) => void;
}

const COLORS = {
  todo: {
    bg: "bg-zinc-100/70 dark:bg-zinc-900/50",
    border: "border-zinc-200/80 dark:border-zinc-800",
    text: "text-zinc-700 dark:text-zinc-300",
  },
  doing: {
    bg: "bg-blue-50/70 dark:bg-blue-950/30",
    border: "border-blue-100 dark:border-blue-900/40",
    text: "text-blue-700 dark:text-blue-300",
  },
  done: {
    bg: "bg-emerald-50/70 dark:bg-emerald-950/30",
    border: "border-emerald-100 dark:border-emerald-900/40",
    text: "text-emerald-700 dark:text-emerald-300",
  },
} as const;

export function KanbanColumn({
  status,
  title,
  tasks,
  blockedCounts,
  onTaskMove,
  onTaskClick,
}: KanbanColumnProps) {
  const c = COLORS[status];

  return (
    <Droppable droppableId={status}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`flex-1 min-w-[280px] max-w-[360px] rounded-xl ${c.bg} ${c.border} border p-3 flex flex-col ${
            snapshot.isDraggingOver ? "ring-2 ring-blue-500" : ""
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${c.text}`}>
              {title} <span className="text-sm font-normal opacity-70">({tasks.length})</span>
            </h3>
          </div>
          <div
            className="flex-1 overflow-y-auto space-y-2 min-h-[200px]"
            {...provided.droppableProps}
            ref={provided.innerRef}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={snapshot.isDragging ? "shadow-lg ring-2 ring-blue-500" : ""}
                  >
                    <TaskCard
                      task={task}
                      onClick={() => onTaskClick(task)}
                      blockedCount={blockedCounts[task.id]?.length ?? 0}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        </div>
      )}
    </Droppable>
  );
}

interface KanbanBoardProps {
  columns: Array<{
    status: TaskRow["status"];
    title: string;
    tasks: TaskRow[];
  }>;
  blockedCounts: Record<number, string[]>;
  onTaskMove: (taskId: number, newStatus: TaskRow["status"]) => void;
  onTaskClick: (task: TaskRow) => void;
}

export function KanbanBoard({
  columns,
  blockedCounts,
  onTaskMove,
  onTaskClick,
}: KanbanBoardProps) {
  return (
    <DragDropContext onDragEnd={(result: DropResult) => {
      if (!result.destination) return;
      if (
        result.destination.droppableId === result.source.droppableId &&
        result.destination.index === result.source.index
      )
        return;
      const taskId = Number(result.draggableId);
      const newStatus = result.destination.droppableId as TaskRow["status"];
      onTaskMove(taskId, newStatus);
    }}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            title={col.title}
            tasks={col.tasks}
            blockedCounts={blockedCounts}
            onTaskMove={onTaskMove}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>
    </DragDropContext>
  );
}