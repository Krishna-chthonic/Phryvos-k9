/**
 * Phase 7: Shared Domain Models & Validation Hub
 * Canonical Zod schemas and validation helpers for Phryvos K9.
 */

import { z } from "zod";

export * from "./settings";
export * from "./chat";
export * from "./provider";
export * from "./vault";
export * from "./memory";
export * from "./tracking";
export * from "./governance";

export class DomainValidationError extends Error {
  constructor(
    public readonly issues: z.ZodIssue[],
    message = "Domain validation failed",
  ) {
    super(message);
    this.name = "DomainValidationError";
  }
}

/**
 * Validates untrusted input against a Zod schema.
 * Throws a clean DomainValidationError with structured issues.
 */
export function validateDomain<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new DomainValidationError(parsed.error.issues);
  }
  return parsed.data;
}

/**
 * Safe validation returning success flag without throwing.
 */
export function safeValidateDomain<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { success: true; data: T } | { success: false; errors: string[] } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  return { success: true, data: parsed.data };
}
