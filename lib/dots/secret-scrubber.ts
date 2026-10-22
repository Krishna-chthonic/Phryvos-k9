/**
 * Secret Scrubber for Dots (D-19).
 * Redacts sensitive tokens, API keys, passwords, and authorization headers from logs,
 * broadcast payloads, and push notifications.
 */

// Matches sk-..., sk-proj-..., sk-ant-..., ghp_..., etc.
const API_KEY_REGEX = /\b(sk-(?:proj-|ant-|live-)?[a-zA-Z0-9_-]{20,})\b/g;

// Matches Bearer tokens
const BEARER_REGEX = /Bearer\s+([a-zA-Z0-9_\-\.]{20,})/gi;

// Matches passwords inside URI connection strings: scheme://user:password@host
// Use greedy match for password up to the last @ before the host
const URI_CRED_REGEX = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s:@/]+):([^/\s]+)@([a-zA-Z0-9_.-]+(?::\d+)?(?:\/[^\s]*)?)/g;

// Matches raw authorization header tokens
const AUTH_HEADER_REGEX = /(Authorization:\s*)(?:Bearer\s+)?([a-zA-Z0-9_\-\.]{20,})/gi;

export function scrubSecrets(input: string): string {
  if (!input || typeof input !== "string") return "";

  let out = input;

  // 1. Redact URI connection string credentials
  out = out.replace(URI_CRED_REGEX, (_match, prefix, _pwd, rest) => {
    // If rest starts with something like host, split at the last @ if multiple
    const parts = (_match as string).split("@");
    if (parts.length > 2) {
      // Multiple @: the last part is the host/path
      const hostPart = parts.pop();
      const userPart = parts.join("@").split("://")[1]?.split(":")[0] || "user";
      const scheme = _match.split("://")[0];
      return `${scheme}://${userPart}:[REDACTED]@${hostPart}`;
    }
    return `${prefix}:[REDACTED]@${rest}`;
  });

  // 2. Redact Bearer tokens
  out = out.replace(BEARER_REGEX, "Bearer [REDACTED_TOKEN]");

  // 3. Redact API keys
  out = out.replace(API_KEY_REGEX, "[REDACTED_API_KEY]");

  // 4. Redact remaining Authorization headers
  out = out.replace(AUTH_HEADER_REGEX, "$1[REDACTED_TOKEN]");

  return out;
}
