/**
 * P3: FSRS Card Review API
 * Importers: components/exams/FSRSReview.tsx (to be created), components/exams/ExamsApp.tsx
 * Affected API: GET/PATCH /api/fsrs/:id
 * Data schema: fsrs_cards table (id, subject_id, topic_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, created_at, updated_at)
 * Dates stored as integer UTC milliseconds
 * User instruction: "Continue Phase 3 implementation - FSRS integration"
 */
import { z } from "zod";
import { requireVault } from "@/server/vault-guard";
import {
  getFSRSCard,
  reviewFSRSCard,
} from "@/lib/exam-service";
import { Rating, DEFAULT_FSRS_PARAMETERS } from "@/lib/fsrs";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(4), // Again=1, Hard=2, Good=3, Easy=4
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireVault();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json(
      { error: { code: "invalid", message: "Invalid card id" } },
      { status: 400 },
    );

  const card = getFSRSCard(ctx, id);
  if (!card)
    return Response.json(
      { error: { code: "not_found", message: `Card ${id} not found` } },
      { status: 404 },
    );

  // Include next interval preview for each rating
  const previews = [1, 2, 3, 4].map((r) => {
    const result = reviewFSRSCard(ctx, id, r as Rating, DEFAULT_FSRS_PARAMETERS, Date.now());
    return {
      rating: r as Rating,
      nextDue: result?.card.due,
      nextStability: result?.card.stability,
      nextDifficulty: result?.card.difficulty,
      nextState: result?.card.state,
      nextIntervalDays: result?.card.scheduledDays,
    };
  });

  return Response.json({ card, previews });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireVault();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0)
    return Response.json(
      { error: { code: "invalid", message: "Invalid card id" } },
      { status: 400 },
    );

  const card = getFSRSCard(ctx, id);
  if (!card)
    return Response.json(
      { error: { code: "not_found", message: `Card ${id} not found` } },
      { status: 404 },
    );

  const body = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "invalid_body", message: parsed.error.issues[0]?.message ?? parsed.error.message } },
      { status: 400 },
    );
  }

  const result = reviewFSRSCard(ctx, id, parsed.data.rating as Rating, DEFAULT_FSRS_PARAMETERS, Date.now());
  if (!result)
    return Response.json(
      { error: { code: "not_found", message: `Card ${id} not found` } },
      { status: 404 },
    );

  return Response.json({ card: result.card, review: result });
}