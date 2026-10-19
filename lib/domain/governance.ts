import { z } from "zod";

export const ApprovalDecisionSchema = z.enum(["allow", "deny"]);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ApprovalRequestSchema = z.object({
  approvalId: z.string().min(1),
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  description: z.string().min(1),
  createdAt: z.number().default(() => Date.now()),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const DaemonTaskStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export type DaemonTaskStatus = z.infer<typeof DaemonTaskStatusSchema>;

export const DaemonTaskSchema = z.object({
  id: z.string().min(1),
  daemonType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  status: DaemonTaskStatusSchema,
  result: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  runAt: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type DaemonTask = z.infer<typeof DaemonTaskSchema>;
