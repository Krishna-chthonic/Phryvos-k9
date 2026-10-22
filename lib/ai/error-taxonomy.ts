export enum ErrorCategory {
  RATE_LIMIT = "RATE_LIMIT",
  AUTH_FAILED = "AUTH_FAILED",
  TIMEOUT = "TIMEOUT",
  CAPABILITY_MISMATCH = "CAPABILITY_MISMATCH",
  TOOL_ERROR = "TOOL_ERROR",
  UNKNOWN = "UNKNOWN",
}

export function classifyError(err: unknown): ErrorCategory {
  const msg =
    (err instanceof Error ? err.message : String(err || "")).toLowerCase();

  if (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("quota exceeded")
  ) {
    return ErrorCategory.RATE_LIMIT;
  }

  if (
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("unauthorized") ||
    msg.includes("forbidden") ||
    msg.includes("invalid api key") ||
    msg.includes("authentication failed")
  ) {
    return ErrorCategory.AUTH_FAILED;
  }

  if (
    msg.includes("504") ||
    msg.includes("524") ||
    msg.includes("408") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("connection reset")
  ) {
    return ErrorCategory.TIMEOUT;
  }

  if (
    msg.includes("does not support vision") ||
    msg.includes("does not support image") ||
    msg.includes("unsupported parameter") ||
    msg.includes("tools not supported") ||
    msg.includes("capability mismatch")
  ) {
    return ErrorCategory.CAPABILITY_MISMATCH;
  }

  if (msg.includes("tool error") || msg.includes("tool execution failed")) {
    return ErrorCategory.TOOL_ERROR;
  }

  return ErrorCategory.UNKNOWN;
}

export function redactSensitiveCredentials(text: string): string {
  if (!text) return text;

  let cleaned = text;

  // Redact Anthropic API keys (sk-ant-...)
  cleaned = cleaned.replace(/sk-ant-[a-zA-Z0-9_\-]{10,}/g, "[REDACTED_API_KEY]");

  // Redact OpenAI / standard API keys (sk-...)
  cleaned = cleaned.replace(/sk-[a-zA-Z0-9_\-]{20,}/g, "[REDACTED_API_KEY]");

  // Redact Bearer tokens
  cleaned = cleaned.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, "Bearer [REDACTED_BEARER]");

  // Redact generic API keys in headers/query params
  cleaned = cleaned.replace(
    /((?:x-api-key|apikey|api_key|token)[:=]\s*["']?)[a-zA-Z0-9_\-]{20,}["']?/gi,
    "$1[REDACTED_API_KEY]",
  );

  return cleaned;
}
