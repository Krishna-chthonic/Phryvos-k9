/**
 * P3: FSRS Spaced Repetition API
 * Importers: components/exams/ExamsApp.tsx, components/exams/FSRSReview.tsx
 * Affected API: GET/POST /api/fsrs
 * Data schema: fsrs_cards (lib/db/schema.ts)
 * User instruction: Continue Phase 3 - FSRS integration
 */
import { z } from "zod";
import { requireVault } from "@/server/vault-guard";
import {
  listFSRSCards,
  getDueFSRSCards,
  createFSRSCardForSubject,
  getUpcomingFSRSReviews,
} from "@/lib/exam-service";
import { Rating, DEFAULT_FSRS_PARAMETERS } from "@/lib/fsrs";

const createCardSchema = z.object({
  subjectId: z.number().int().positive(),
  topicId: z.number().int().positive().nullable().optional(),
});

export async function GET(req: Request) {
  const ctx = await requireVault();
  const { searchParams } = new URL(req.url);
  const subjectId = searchParams.get("subjectId") ? Number(searchParams.get("subjectId")) : undefined;
  const dueOnly = searchParams.get("due") === "true";
  const upcoming = searchParams.get("upcoming") === "true";
  const windowMs = searchParams.get("windowMs") ? Number(searchParams.get("windowMs")) : 7 * 24 * 60 * 60 * 1000; // 7 days default

  if (dueOnly) {
    const cards = getDueFSRSCards(ctx, subjectId);
    return Response.json({ cards });
  }
  if (upcoming) {
    const cards = getUpcomingFSRSReviews(ctx, subjectId, windowMs);
    return Response.json({ cards });
  }

  const cards = listFSRSCards(ctx, subjectId);
  return Response.json({ cards });
}

export async function POST(req: Request) {
  const ctx = await requireVault();
  const body = await req.json().catch(() => null);

  const parsed = createCardSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "invalid_body", message: parsed.error.issues[0]?.message ?? parsed.error.message } },
      { status: 400 },
    );
  }

  const card = createFSRSCardForSubject(
    ctx,
    parsed.data.subjectId,
    parsed.data.topicId ?? null,
    DEFAULT_FSRS_PARAMETERS,
  );

  return Response.json({ card }, { status: 201 });
}