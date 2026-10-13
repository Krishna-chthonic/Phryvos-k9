/**
 * P6/P8: exam topics sub-route — importers: components/exams/ExamsApp.tsx
 * Affected API: GET/POST /api/exam-subjects/:id/topics
 * Data schema: exam_topics (lib/db/schema.ts)
 */
import { requireVault } from "@/server/vault-guard";
import { listTopics, createTopic } from "@/lib/exam-service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireVault();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json(
      { error: { code: "invalid", message: "Invalid subject id" } },
      { status: 400 },
    );
  const topics = listTopics(ctx, id);
  return Response.json({ topics });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireVault();
  const subjectId = Number((await params).id);
  if (!Number.isInteger(subjectId) || subjectId <= 0)
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
  const topic = createTopic(ctx, {
    subjectId,
    name: body.name,
    dueDate: body.dueDate ?? null,
  });
  return Response.json({ topic }, { status: 201 });
}
