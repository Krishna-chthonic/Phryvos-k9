import {
  internalResponse,
  requireVault,
  vaultGuardResponse,
  type VaultContext,
} from "@/server/vault-guard";
import { TrackingError } from "@/lib/tracking-service";

const TRACKING_STATUS: Record<TrackingError["code"], number> = {
  not_found: 404,
  invalid: 400,
  blocked_by_dependencies: 409,
  dep_cycle: 409,
};

/**
 * P5 vault-route wrapper: same auth shapes as `vaultRoute` (401 / 503{locked}),
 * plus `TrackingError` codes → status. 409 responses carry `details`
 * (open blockers / cycle) so the UI can render the blocked-complete rule.
 */
export async function trackingRoute<T>(
  fn: (ctx: VaultContext) => T | Promise<T>,
): Promise<Response> {
  try {
    const ctx = await requireVault();
    return (await fn(ctx)) as Response;
  } catch (e) {
    const authResp = vaultGuardResponse(e);
    if (authResp) return authResp;
    if (e instanceof TrackingError)
      return Response.json(
        {
          error: {
            code: e.code,
            message: e.message,
            ...(e.details ? { details: e.details } : {}),
          },
        },
        { status: TRACKING_STATUS[e.code] },
      );
    return internalResponse(e);
  }
}

/** Parse a numeric `:id` route param; null when malformed (caller 404s). */
export async function parseId(
  params: Promise<{ id: string }>,
): Promise<number | null> {
  const n = Number((await params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
}
