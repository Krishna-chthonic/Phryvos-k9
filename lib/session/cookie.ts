/** Cookie options for the vault session (httpOnly; Secure in production; SameSite strict for CSRF prevention). */
export function sessionCookieOptions(ttlMs: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.max(1, Math.floor(ttlMs / 1000)),
    expires: new Date(Date.now() + ttlMs),
  };
}

export function sessionCookieClearOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: 0,
  };
}
