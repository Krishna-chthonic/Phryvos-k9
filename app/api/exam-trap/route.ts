/**
 * P3: IIT Professor Trap-Question Synthesizer API
 * Importers: components/exams/ExamsApp.tsx (new Boss Fight integration)
 * Affected API: GET/POST /api/exam-trap
 * User instruction: "Continue Phase 3 implementation - Trap Question Synthesizer"
 */

import { requireVault } from "@/server/vault-guard";
import { synthesizeTrapQuestion, type TrapQuestion } from "@/lib/exams/trap-synthesizer";
import { listStudyLogs } from "@/lib/exam-service";

export async function GET(req: Request) {
  let ctx: any;
  try {
    ctx = await requireVault();
  } catch (e) {
    return Response.json(
      { error: { code: "unauthorized", message: "Vault locked" } },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const subject = searchParams.get("subject") || undefined;
  const includeExplanation = searchParams.get("explain") === "true";

  // Get user's weak concepts from study logs (simplified heuristic)
  let weakConcepts: string[] = [];
  try {
    const logs = listStudyLogs(ctx, { limit: 100 });
    weakConcepts = extractWeakConcepts(logs);
  } catch {
    // Ignore extraction errors
  }

  const question = synthesizeTrapQuestion(subject, weakConcepts);

  if (!includeExplanation) {
    // Return only problem and options (no conceptual breakdown for active quiz)
    const { conceptualBreakdown, shortcutTrick, misconceptionsTargeted, ...quiz } = question;
    return Response.json({ question: quiz });
  }

  return Response.json({ question });
}

export async function POST(req: Request) {
  try {
    await requireVault();
  } catch (e) {
    return Response.json(
      { error: { code: "unauthorized", message: "Vault locked" } },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { subject, weakConcepts } = body as { subject?: string; weakConcepts?: string[] };

  const question = synthesizeTrapQuestion(subject, weakConcepts);

  return Response.json({ question }, { status: 201 });
}

function extractWeakConcepts(logs: ReturnType<typeof listStudyLogs>): string[] {
  const concepts: Record<string, number> = {};

  for (const log of logs) {
    if (log.note) {
      const text = log.note.toLowerCase();
      if (text.includes("pseudo") || text.includes("pseudo-force")) concepts["pseudo-force"] = (concepts["pseudo-force"] || 0) + 1;
      if (text.includes("rotational") || text.includes("torque")) concepts["rotational dynamics"] = (concepts["rotational dynamics"] || 0) + 1;
      if (text.includes("rolling")) concepts["rolling constraint"] = (concepts["rolling constraint"] || 0) + 1;
      if (text.includes("work energy") || text.includes("work-energy")) concepts["work energy theorem"] = (concepts["work energy theorem"] || 0) + 1;
      if (text.includes("inert") || text.includes("non-inertial")) concepts["non-inertial frames"] = (concepts["non-inertial frames"] || 0) + 1;
      if (text.includes("king") || text.includes("reflection")) concepts["king's property"] = (concepts["king's property"] || 0) + 1;
      if (text.includes("2^x") || text.includes("exponential")) concepts["exponential integral"] = (concepts["exponential integral"] || 0) + 1;
      if (text.includes("le chatelier") || text.includes("inert gas")) concepts["inert gas equilibrium"] = (concepts["inert gas equilibrium"] || 0) + 1;
      if (text.includes("moment of inertia")) concepts["moment of inertia"] = (concepts["moment of inertia"] || 0) + 1;
    }
  }

  return Object.entries(concepts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k]) => k);
}