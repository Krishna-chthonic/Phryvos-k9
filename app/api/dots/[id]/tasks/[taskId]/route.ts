import { z } from "zod";
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { getDotTask, updateDotTask, deleteDotTask } from "@/lib/dots-service";
import { dotRunner } from "@/lib/dots-runner";

const UpdateTaskSchema = z.object({
  prompt: z.string().optional(),
  status: z.enum(["queued", "running", "completed", "failed", "paused"]).optional(),
  intervalSeconds: z.number().nullable().optional(),
  nextRunAt: z.number().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params;
  try {
    const ctx = await requireVault();
    const body = await req.json();
    const parsed = UpdateTaskSchema.parse(body);

    const updated = updateDotTask(ctx, taskId, parsed);
    if (!updated) {
      return Response.json({ error: { code: "not_found", message: "Task not found" } }, { status: 404 });
    }

    return Response.json({ task: updated });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
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
  const { taskId } = await params;
  try {
    const ctx = await requireVault();
    const ok = deleteDotTask(ctx, taskId);
    return Response.json({ success: ok });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
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
    await requireVault();
    const task = await getDotTask(await requireVault(), taskId);
    if (!task) {
      return Response.json({ error: { code: "not_found", message: "Task not found" } }, { status: 404 });
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
