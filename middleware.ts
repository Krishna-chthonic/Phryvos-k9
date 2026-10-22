/**
 * P8: Security middleware — CSP headers and security hardening.
 * Runs on all routes except /_next/*, /public/*, /api/auth/unlock (no-CSP for SSE),
 * and favicon. Implements strict CSP for local-first app.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CSP_POLICY = [
  "default-src 'self'",
  process.env.NODE_ENV === "production"
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* https://api.openai.com https://api.anthropic.com https://text.pollinations.ai https://image.pollinations.ai",
  "frame-src 'self'",
  "worker-src 'self' blob:",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const NO_SNIFF = "nosniff";
const X_FRAME = "DENY";
const REFERRER = "strict-origin-when-cross-origin";
const PERMISSIONS = "camera=(), microphone=(), geolocation=()";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip middleware only for static assets and Next.js internal chunks
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/public/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  response.headers.set("Content-Security-Policy", CSP_POLICY);
  response.headers.set("X-Content-Type-Options", NO_SNIFF);
  response.headers.set("X-Frame-Options", X_FRAME);
  response.headers.set("Referrer-Policy", REFERRER);
  response.headers.set("Permissions-Policy", PERMISSIONS);

  const proto = request.headers.get("x-forwarded-proto");
  if (proto === "https") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  if (pathname.startsWith("/api/") || pathname === "/unlock" || pathname === "/setup") {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};