/**
 * Session Audit & Step Traceability Engine for Phryvos-K9
 * Inspired by DeepSeek Harness (deepseek-ai/deepseek-harness)
 * 
 * Provides an append-only verifiable audit trail for every agent turn,
 * tool invocation, thinking phase, and coworker Dot step.
 */

export interface AuditStepTrace {
  id: string;
  sessionId?: string;
  dotName?: string;
  stepNumber: number;
  timestamp: number;
  phase: "prompt" | "thinking" | "tool_call" | "tool_result" | "completion" | "safety_block";
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolResultSnippet?: string;
  thinkingSnippet?: string;
  durationMs?: number;
}

// In-memory rolling ring buffer of recent execution step traces (last 200 steps)
const MAX_BUFFER_SIZE = 200;
const traceBuffer: AuditStepTrace[] = [];

/**
 * Records an audit step into the ring buffer
 */
export function recordAuditStep(trace: Omit<AuditStepTrace, "id" | "timestamp">): AuditStepTrace {
  const fullTrace: AuditStepTrace = {
    ...trace,
    id: `trace-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
  };

  traceBuffer.unshift(fullTrace);
  if (traceBuffer.length > MAX_BUFFER_SIZE) {
    traceBuffer.pop();
  }

  return fullTrace;
}

/**
 * Returns recent audit traces, optionally filtered by session or dot
 */
export function getRecentAuditTraces(limit = 50, filter?: { sessionId?: string; dotName?: string }): AuditStepTrace[] {
  let filtered = traceBuffer;
  if (filter?.sessionId) {
    filtered = filtered.filter((t) => t.sessionId === filter.sessionId);
  }
  if (filter?.dotName) {
    filtered = filtered.filter((t) => t.dotName?.toLowerCase() === filter.dotName?.toLowerCase());
  }
  return filtered.slice(0, limit);
}

/**
 * Clears the audit buffer
 */
export function clearAuditTraces(): void {
  traceBuffer.length = 0;
}
