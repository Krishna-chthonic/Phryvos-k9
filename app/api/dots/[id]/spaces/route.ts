import { z } from "zod";
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { listDotSpaces, saveDotSpace, deleteDotSpace } from "@/lib/dots-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    const ctx = await requireVault();
    const spaces = listDotSpaces(ctx, id);
    return Response.json({ spaces });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

const SaveSpaceSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  content: z.string(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const dotId = (await params).id;
  try {
    const ctx = await requireVault();
    const body = await req.json();
    const parsed = SaveSpaceSchema.parse(body);
    const space = saveDotSpace(ctx, dotId, parsed);
    return Response.json({ space });
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
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const dotId = (await params).id;
  try {
    const ctx = await requireVault();
    const url = new URL(req.url);
    const spaceId = url.searchParams.get("spaceId");
    if (!spaceId) {
      return Response.json({ error: { code: "missing_param", message: "spaceId is required" } }, { status: 400 });
    }
    deleteDotSpace(ctx, spaceId, dotId);
    return Response.json({ ok: true });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof Error && e.message.startsWith("Forbidden:")) {
      return Response.json({ error: { code: "forbidden", message: e.message } }, { status: 403 });
    }
    return internalResponse(e);
  }
}
