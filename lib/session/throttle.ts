type GlobalThrottle = { __phryvosThrottle?: Map<string, number[]> };
const g = globalThis as unknown as GlobalThrottle;

/**
 * Tiny in-process rate limiter for unlock attempts (single-user local app;
 * this defends against brute force only, which is the relevant threat model).
 */

export class ThrottleError extends Error {
  constructor() {
    super("Too many attempts — wait a minute and try again.");
  }
}

function window(key: string): number[] {
  if (!g.__phryvosThrottle) g.__phryvosThrottle = new Map();
  const now = Date.now();
  const arr = (g.__phryvosThrottle.get(key) ?? []).filter(
    (t) => now - t < 60_000,
  );
  g.__phryvosThrottle.set(key, arr);
  return arr;
}

export function recordFail(key: string): void {
  window(key).push(Date.now());
}

/** @throws ThrottleError when ≥ limit failures occurred in the last 60s. */
export function assertNotThrottled(key: string, limit = 5): void {
  if (window(key).length >= limit) throw new ThrottleError();
}

/** Test/inspection helper: reset a key. */
export function clearThrottle(key: string): void {
  g.__phryvosThrottle?.delete(key);
}
