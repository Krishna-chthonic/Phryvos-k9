/**
 * P6: study logs API — importers: app/(app)/exams/page.tsx UI component.
 * Affected API: GET/POST /api/study-logs
 * Data schema: study_logs (lib/db/schema.ts)
 * User instruction: continue
 */
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { listStudyLogs, createStudyLog, ExamError } from "@/lib/exam-service";

export async function GET(req: Request) {
  try {
    const ctx = await requireVault();
    const sp = new URL(req.url).searchParams;
    const logs = listStudyLogs(ctx, {
      topicId: sp.get("topicId") ? Number(sp.get("topicId")) : undefined,
      subjectId: sp.get("subjectId") ? Number(sp.get("subjectId")) : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return Response.json({ logs });
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
    const log = createStudyLog(ctx, {
      topicId: body.topicId ?? null,
      subjectId: body.subjectId ?? null,
      startedAt: body.startedAt ?? Date.now(),
      durationMin: body.durationMin,
      note: body.note ?? null,
    });
    return Response.json({ log }, { status: 201 });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof ExamError && e.code === "invalid") {
      return Response.json({ error: { code: "invalid", message: e.message } }, { status: 400 });
    }
    return internalResponse(e);
  }
}
