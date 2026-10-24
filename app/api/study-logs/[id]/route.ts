/**
 * P6: study log detail API — importers: app/(app)/exams/page.tsx UI component.
 * Affected API: DELETE /api/study-logs/:id
 * Data schema: study_logs (lib/db/schema.ts)
 * User instruction: continue
 */
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { deleteStudyLog, ExamError } from "@/lib/exam-service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireVault();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0)
      return Response.json(
        { error: { code: "invalid", message: "Invalid log id" } },
        { status: 400 },
      );
    deleteStudyLog(ctx, id);
    return Response.json({ ok: true });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof ExamError && e.code === "not_found") {
      return Response.json({ error: { code: "not_found", message: e.message } }, { status: 404 });
    }
    return internalResponse(e);
  }
}
