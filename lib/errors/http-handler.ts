import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, sanitizeErrorText } from "./app-error";

export function handleRouteError(err: unknown, correlationId?: string): NextResponse {
  // If already an AppError, format directly
  if (err instanceof AppError) {
    return NextResponse.json(err.toResponseJson(), { status: err.statusCode });
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const appErr = new AppError({
      code: "VALIDATION_ERROR",
      statusCode: 400,
      safeMessage: "Request payload failed schema validation",
      details: {
        issues: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      cause: err,
      correlationId,
    });
    return NextResponse.json(appErr.toResponseJson(), { status: appErr.statusCode });
  }

  // SQLite foreign key or constraint errors
  const errStr = String(err);
  if (errStr.includes("FOREIGN KEY constraint failed") || errStr.includes("UNIQUE constraint failed")) {
    const appErr = new AppError({
      code: "STORAGE_ERROR",
      statusCode: 409,
      safeMessage: "Database constraint integrity violation",
      retryable: false,
      cause: err,
      correlationId,
    });
    return NextResponse.json(appErr.toResponseJson(), { status: appErr.statusCode });
  }

  // Generic fallback
  const rawMsg = err instanceof Error ? err.message : String(err);
  const safeMsg = sanitizeErrorText(rawMsg || "An unexpected internal error occurred");

  const fallback = new AppError({
    code: "INTERNAL_ERROR",
    statusCode: 500,
    safeMessage: safeMsg,
    retryable: false,
    cause: err,
    correlationId,
  });

  return NextResponse.json(fallback.toResponseJson(), { status: fallback.statusCode });
}
