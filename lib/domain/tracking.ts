import { z } from "zod";

export const TaskStatusSchema = z.enum(["todo", "doing", "done"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.number().int().min(0).max(3); // 0=low, 1=med, 2=high, 3=urgent
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskRowSchema = z.object({
  id: z.number().int().positive(),
  projectId: z.number().nullable(),
  projectTitle: z.string().nullable().optional(),
  title: z.string().min(1).max(255),
  description: z.string().nullable(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  dueDate: z.string().nullable(),
  startDate: z.string().nullable(),
  tags: z.array(z.string()).default([]),
  completedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type TaskRow = z.infer<typeof TaskRowSchema>;

export const ProjectRowSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1).max(255),
  description: z.string().nullable(),
  color: z.string().nullable(),
  status: z.enum(["active", "archived"]),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  taskCount: z.number().nonnegative().optional(),
  doneCount: z.number().nonnegative().optional(),
});
export type ProjectRow = z.infer<typeof ProjectRowSchema>;
