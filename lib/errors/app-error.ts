import { randomUUID } from "node:crypto";

export type ErrorCategory =
  | "VALIDATION_ERROR"
  | "AUTH_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "PROVIDER_ERROR"
  | "NETWORK_ERROR"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "STORAGE_ERROR"
  | "DATA_CORRUPTION"
  | "TOOL_EXECUTION_ERROR"
  | "PERMISSION_DENIED"
  | "INTERNAL_ERROR";

export interface ErrorOptions {
  code: ErrorCategory;
  statusCode?: number;
  safeMessage: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
  correlationId?: string;
}

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_\-]{20,}/g, // OpenAI & Anthropic keys
  /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi, // Bearer tokens
  /password\s*[:=]\s*["']?[^"'\s,]+/gi,
  /key\s*[:=]\s*["']?[^"'\s,]+/gi,
  /[0-9a-fA-F]{64}/g, // 32-byte hex keys
];

/**
 * Strips raw secrets, API keys, and hashes from logs and error strings.
 */
export function sanitizeErrorText(text: string): string {
  if (!text || typeof text !== "string") return "";
  let sanitized = text;
  for (const re of SECRET_PATTERNS) {
    sanitized = sanitized.replace(re, "[REDACTED_SECRET]");
  }
  return sanitized;
}

export class AppError extends Error {
  public readonly code: ErrorCategory;
  public readonly statusCode: number;
  public readonly safeMessage: string;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;
  public readonly correlationId: string;

  constructor(opts: ErrorOptions) {
    const sanitizedMsg = sanitizeErrorText(opts.safeMessage);
    super(sanitizedMsg);
    this.name = "AppError";
    this.code = opts.code;
    this.statusCode = opts.statusCode ?? AppError.defaultStatus(opts.code);
    this.safeMessage = sanitizedMsg;
    this.retryable = opts.retryable ?? AppError.isDefaultRetryable(opts.code);
    this.details = opts.details;
    this.correlationId = opts.correlationId ?? randomUUID();
    if (opts.cause) {
      this.cause = opts.cause;
    }
  }

  private static defaultStatus(code: ErrorCategory): number {
    switch (code) {
      case "VALIDATION_ERROR":
        return 400;
      case "AUTH_ERROR":
        return 401;
      case "FORBIDDEN":
      case "PERMISSION_DENIED":
        return 403;
      case "NOT_FOUND":
        return 404;
      case "RATE_LIMIT":
        return 429;
      case "TIMEOUT":
        return 504;
      case "NETWORK_ERROR":
      case "PROVIDER_ERROR":
        return 502;
      case "STORAGE_ERROR":
      case "DATA_CORRUPTION":
      case "TOOL_EXECUTION_ERROR":
      case "INTERNAL_ERROR":
      default:
        return 500;
    }
  }

  private static isDefaultRetryable(code: ErrorCategory): boolean {
    return code === "NETWORK_ERROR" || code === "RATE_LIMIT" || code === "TIMEOUT" || code === "PROVIDER_ERROR";
  }

  public toResponseJson() {
    return {
      ok: false as const,
      error: {
        code: this.code,
        message: this.safeMessage,
        retryable: this.retryable,
        correlationId: this.correlationId,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}
