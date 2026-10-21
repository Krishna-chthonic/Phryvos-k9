import { z } from "zod";
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { listDots, createDot } from "@/lib/dots-service";
import { dotRunner } from "@/lib/dots-runner";

export async function GET() {
  try {
    const ctx = await requireVault();
    dotRunner.start();
    const dots = listDots(ctx);
    return Response.json({ dots });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

const CreateSchema = z.object({
  name: z.string().min(1).max(50),
  character: z.enum(["blue", "mint", "orange", "purple"]).optional(),
  role: z.string().min(1).max(100),
  description: z.string().optional(),
  systemPrompt: z.string().min(1),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  workingDirectory: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await requireVault();
    const body = await req.json();
    const parsed = CreateSchema.parse(body);
    const dot = createDot(ctx, parsed);
    return Response.json({ dot }, { status: 201 });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof z.ZodError) {
      return Response.json({ error: { code: "invalid_input", issues: e.issues } }, { status: 400 });
    }
    return internalResponse(e);
  }
}
