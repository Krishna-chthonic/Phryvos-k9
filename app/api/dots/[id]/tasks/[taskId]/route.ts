import { z } from "zod";
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { getDotTask, updateDotTask, deleteDotTask } from "@/lib/dots-service";
import { dotRunner } from "@/lib/dots-runner";

const UpdateTaskSchema = z.object({
  prompt: z.string().optional(),
  status: z.enum(["queued", "running", "completed", "failed", "paused"]).optional(),
  intervalSeconds: z.number().int().min(60).max(31536000).nullable().optional(),
  nextRunAt: z.number().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: dotId, taskId } = await params;
  try {
    const ctx = await requireVault();
    const body = await req.json();
    const parsed = UpdateTaskSchema.parse(body);

    const updated = updateDotTask(ctx, taskId, parsed, dotId);
    if (!updated) {
      return Response.json({ error: { code: "not_found", message: "Task not found" } }, { status: 404 });
    }

    if (parsed.status === "paused" || parsed.status === "failed") {
      dotRunner.abortTask(taskId);
    }

    return Response.json({ task: updated });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof Error && e.message.startsWith("Forbidden:")) {
      return Response.json({ error: { code: "forbidden", message: e.message } }, { status: 403 });
    }
    if (e instanceof z.ZodError) {
      return Response.json({ error: { code: "invalid_input", issues: e.issues } }, { status: 400 });
    }
    return internalResponse(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: dotId, taskId } = await params;
  try {
    const ctx = await requireVault();
    dotRunner.abortTask(taskId);
    const ok = deleteDotTask(ctx, taskId, dotId);
    return Response.json({ success: ok });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof Error && e.message.startsWith("Forbidden:")) {
      return Response.json({ error: { code: "forbidden", message: e.message } }, { status: 403 });
    }
    return internalResponse(e);
  }
}

/**
 * Trigger immediate execution of a task.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: dotId, taskId } = await params;
  try {
    const ctx = await requireVault();
    const task = getDotTask(ctx, taskId);
    if (!task) {
      return Response.json({ error: { code: "not_found", message: "Task not found" } }, { status: 404 });
    }
    if (task.dotId !== dotId) {
      return Response.json({ error: { code: "forbidden", message: "Task does not belong to this Dot" } }, { status: 403 });
    }
    if (task.status === "running") {
      return Response.json({ error: { code: "conflict", message: "Task is already running" } }, { status: 409 });
    }

    // Trigger in background asynchronously
    void dotRunner.runTaskNow(taskId, dotId);

    return Response.json({ success: true, message: "Task execution started" });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}
