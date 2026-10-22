/**
 * API route for listing and creating permanent AI memories.
 *
 * Importers/callers:
 *   - components/settings/MemoryPanel.tsx
 *   - Client fetches
 *
 * Affected API:
 *   - GET /api/memories
 *   - POST /api/memories
 *
 * Data schemas if any:
 *   - memories table (id, point, category, created_at, updated_at)
 *
 * User instruction verbatim: "3. ek memmory system bhi hona chahiye ai ke liye jisme vo points bana ke chijo ko permanentlt yaad rakhe jinko users khud se kahe ki ye chij yaad rakhna ya permanently save kar lo"
 */

import { z } from "zod";
import { internalResponse, requireVault, vaultGuardResponse } from "@/server/vault-guard";
import { addMemory, listMemories } from "@/lib/memory-service";

export async function GET() {
  try {
    const ctx = await requireVault();
    const memories = listMemories(ctx.db);
    return Response.json({ memories });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

const CreateSchema = z.object({
  point: z.string().min(1).max(2000),
  category: z.string().optional(),
  sourceSessionId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await requireVault();
    const body = CreateSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return Response.json(
        { error: { code: "invalid_body", message: "Memory point text is required" } },
        { status: 400 },
      );
    }

    const memory = addMemory(ctx.db, body.data.point, body.data.category, {
      sourceSessionId: body.data.sourceSessionId,
      source: "user",
    });
    return Response.json({ memory }, { status: 201 });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}
