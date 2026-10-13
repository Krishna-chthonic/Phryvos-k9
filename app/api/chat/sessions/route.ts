import { z } from "zod";
import { vaultRoute } from "@/server/vault-guard";
import { createSession, listSessions } from "@/lib/chat-service";

/**
 * GET  /api/chat/sessions               → recent sessions
 * POST /api/chat/sessions {title?, model, providerId?} → new session
 */
export async function GET() {
  return vaultRoute(({ db, key }) =>
    Response.json({ sessions: listSessions({ db, key }) }),
  );
}

const Body = z.object({
  title: z.string().max(120).optional(),
  model: z.string().min(1),
  providerId: z.number().int().positive().nullable().optional(),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: { code: "invalid_body", message: "Bad {title?, model, providerId?}" } },
      { status: 400 },
    );
  return vaultRoute(({ db, key }) => {
    const session = createSession(
      { db, key },
      {
        title: body.data.title,
        model: body.data.model,
        providerId: body.data.providerId ?? null,
      },
    );
    return Response.json({ session }, { status: 201 });
  });
}
