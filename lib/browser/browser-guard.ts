/**
 * Browser Permission Guard for Dots / AI Coworkers
 * Enforces per-Dot tool boundaries on browser endpoints.
 */

export function verifyDotBrowserPermission(tools: string[] | undefined | null): boolean {
  if (!tools || !Array.isArray(tools)) return false;
  return (
    tools.includes("*") ||
    tools.includes("all") ||
    tools.includes("omni") ||
    tools.includes("browser")
  );
}
