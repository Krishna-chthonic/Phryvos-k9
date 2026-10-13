"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Lock watchdog: the server auto-locks the vault after idle TTL; poll the
 * public status endpoint and bounce to /unlock as soon as the session dies.
 * Renders nothing.
 */
export function LockWatchdog() {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    const timer = setInterval(async () => {
      if (stopped) return;
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store" });
        const json = (await res.json()) as { state: string };
        if (json.state !== "unlocked") {
          stopped = true;
          router.replace("/unlock");
        }
      } catch {
        // transient error (e.g. dev server restarting) — ignore
      }
    }, 20_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [router]);

  return null;
}
