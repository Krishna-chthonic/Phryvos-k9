/**
 * P6: exam subjects API — importers: app/(app)/exams/page.tsx UI component.
 * Affected API: GET/POST /api/exam-subjects, GET/PATCH/DELETE /api/exam-subjects/:id,
 *   GET/POST /api/exam-subjects/:id/topics
 * Data schema: exam_subjects, exam_topics (lib/db/schema.ts)
 * User instruction: continue
 */
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { listSubjects, getSubject, createSubject, ExamError } from "@/lib/exam-service";

export async function GET() {
  try {
    const ctx = await requireVault();
    return Response.json({ subjects: listSubjects(ctx) });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    return internalResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireVault();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object")
      return Response.json(
        { error: { code: "invalid_body", message: "Bad request body" } },
        { status: 400 },
      );
    const subject = createSubject(ctx, {
      name: body.name,
      targetDate: body.targetDate ?? null,
      color: body.color ?? null,
    });
    return Response.json({ subject }, { status: 201 });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof ExamError && e.code === "invalid") {
      return Response.json({ error: { code: "invalid", message: e.message } }, { status: 400 });
    }
    return internalResponse(e);
  }
}
