import { classifyError, ErrorCategory } from "./error-taxonomy";

export interface FailoverCandidate {
  providerId: number;
  model: string;
}

/**
 * Enforces tool execution idempotency:
 * If an external tool (e.g. write_file, terminal, delete_database) has already been executed
 * within the active turn, automatic blind failover replay could cause duplicate side effects.
 * Automatic failover is only safe when NO tools have executed yet in the turn.
 */
export function canSafelyFailover(hasExecutedTools: boolean): boolean {
  return !hasExecutedTools;
}

/**
 * Determines whether an error is transient and eligible for failover.
 */
export function isEligibleForFailover(err: unknown, hasExecutedTools: boolean): boolean {
  if (!canSafelyFailover(hasExecutedTools)) {
    return false;
  }

  const category = classifyError(err);
  return (
    category === ErrorCategory.RATE_LIMIT ||
    category === ErrorCategory.TIMEOUT ||
    category === ErrorCategory.AUTH_FAILED
  );
}
