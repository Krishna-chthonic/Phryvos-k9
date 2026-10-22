import { z } from "zod";
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { listDotTasks, createDotTask, getDot } from "@/lib/dots-service";
import { dotRunner } from "@/lib/dots-runner";

const CreateTaskSchema = z.object({
  prompt: z.string().min(1),
  intervalSeconds: z.number().int().min(60).max(31536000).nullable().optional(),
  nextRunAt: z.number().nullable().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    const ctx = await requireVault();
    dotRunner.start(); // Ensure background runner is active

    const dot = getDot(ctx, id);
    if (!dot) {
      return Response.json({ error: { code: "not_found", message: "Dot not found" } }, { status: 404 });
    }

    const tasks = listDotTasks(ctx, id);
    return Response.json({ tasks });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    const ctx = await requireVault();
    dotRunner.start();

    const dot = getDot(ctx, id);
    if (!dot) {
      return Response.json({ error: { code: "not_found", message: "Dot not found" } }, { status: 404 });
    }

    const body = await req.json();
    const parsed = CreateTaskSchema.parse(body);

    const task = createDotTask(ctx, id, {
      prompt: parsed.prompt,
      intervalSeconds: parsed.intervalSeconds ?? null,
      nextRunAt: parsed.nextRunAt ?? null,
    });

    return Response.json({ task }, { status: 201 });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof z.ZodError) {
      return Response.json({ error: { code: "invalid_input", issues: e.issues } }, { status: 400 });
    }
    return internalResponse(e);
  }
}
