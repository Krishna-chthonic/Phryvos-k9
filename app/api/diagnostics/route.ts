import { NextResponse } from "next/server";
import { vaultRoute } from "@/server/vault-guard";
import { diagnostics } from "@/lib/diagnostics/logger";

/**
 * GET /api/diagnostics
 * Returns structured health, latency metrics, and SQLite status with secrets redacted.
 */
export async function GET() {
  return vaultRoute(({ db }) => {
    const report = diagnostics.generateReport(db);
    return NextResponse.json({ ok: true, diagnostics: report });
  });
}
