/**
 * P6: exam subjects detail API — importers: app/(app)/exams/page.tsx UI component.
 * Affected API: GET/PATCH/DELETE /api/exam-subjects/:id,
 *   GET/POST /api/exam-subjects/:id/topics
 * Data schema: exam_subjects, exam_topics, study_logs (lib/db/schema.ts)
 * User instruction: continue
 */
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import {
  getSubject,
  listTopics,
  deleteSubject,
  ExamError,
} from "@/lib/exam-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireVault();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0)
      return Response.json(
        { error: { code: "invalid", message: "Invalid subject id" } },
        { status: 400 },
      );
    const subject = getSubject(ctx, id);
    if (!subject)
      return Response.json(
        { error: { code: "not_found", message: `Subject ${id} not found` } },
        { status: 404 },
      );
    const topics = listTopics(ctx, id);
    return Response.json({ subject, topics });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireVault();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0)
      return Response.json(
        { error: { code: "invalid", message: "Invalid subject id" } },
        { status: 400 },
      );
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object")
      return Response.json(
        { error: { code: "invalid_body", message: "Bad request body" } },
        { status: 400 },
      );
    const subject = getSubject(ctx, id);
    if (!subject)
      return Response.json(
        { error: { code: "not_found", message: `Subject ${id} not found` } },
        { status: 404 },
      );
    const now = Date.now();
    ctx.db.prepare(`
      UPDATE exam_subjects
      SET name = COALESCE(?, name), target_date = COALESCE(?, target_date),
          color = COALESCE(?, color), updated_at = ?
      WHERE id = ?
    `).run(body.name ?? null, body.targetDate ?? null, body.color ?? null, now, id);
    const updated = getSubject(ctx, id)!;
    return Response.json({ subject: updated });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireVault();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0)
      return Response.json(
        { error: { code: "invalid", message: "Invalid subject id" } },
        { status: 400 },
      );
    deleteSubject(ctx, id);
    return Response.json({ ok: true });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof ExamError && e.code === "not_found") {
      return Response.json(
        { error: { code: "not_found", message: e.message } },
        { status: 404 },
      );
    }
    return internalResponse(e);
  }
}

