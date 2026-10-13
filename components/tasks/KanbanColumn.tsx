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
  todo: { bg: "bg-zinc-50", border: "border-zinc-200", text: "text-zinc-600" },
  doing: { bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-700" },
  done: { bg: "bg-green-50", border: "border-green-100", text: "text-green-700" },
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