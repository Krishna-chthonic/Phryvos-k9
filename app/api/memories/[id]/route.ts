/**
 * API route for deleting and updating an individual permanent AI memory.
 *
 * Importers/callers: components/settings/MemoryPanel.tsx
 * Affected API: DELETE /api/memories/[id], PATCH /api/memories/[id]
 * Data schemas if any: memories table (id, point, category, created_at, updated_at)
 * User instruction verbatim: "3. ek memmory system bhi hona chahiye ai ke liye jisme vo points bana ke chijo ko permanentlt yaad rakhe jinko users khud se kahe ki ye chij yaad rakhna ya permanently save kar lo"
 */

import { z } from "zod";
import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { deleteMemory, updateMemory } from "@/lib/memory-service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireVault();
    const id = Number((await params).id);
    if (!Number.isFinite(id)) {
      return Response.json(
        { error: { code: "invalid_id", message: "Invalid memory ID" } },
        { status: 400 },
      );
    }

    const ok = deleteMemory(ctx.db, id);
    if (!ok) {
      return Response.json(
        { error: { code: "not_found", message: "Memory not found" } },
        { status: 404 },
      );
    }

    return Response.json({ ok: true });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

const PatchSchema = z.object({
  point: z.string().min(1).max(2000),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireVault();
    const id = Number((await params).id);
    if (!Number.isFinite(id)) {
      return Response.json(
        { error: { code: "invalid_id", message: "Invalid memory ID" } },
        { status: 400 },
      );
    }

    const body = PatchSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return Response.json(
        { error: { code: "invalid_body", message: "Memory point text is required" } },
        { status: 400 },
      );
    }

    const ok = updateMemory(ctx.db, id, body.data.point);
    if (!ok) {
      return Response.json(
        { error: { code: "not_found", message: "Memory not found" } },
        { status: 404 },
      );
    }

    return Response.json({ ok: true });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}
