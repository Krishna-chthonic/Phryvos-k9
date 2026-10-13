import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getVaultState } from "@/lib/auth-state";
import { LockWatchdog } from "@/components/shell/LockCountdown";
import { AppShell } from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";

/**
 * Gated app shell: nothing renders unless the vault is unlocked right now
 * (checked on every server render).
 */
export default async function AppShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  const state = await getVaultState();
  if (state !== "unlocked") {
    redirect(state === "setup_required" ? "/setup" : "/unlock");
  }

  return (
    <>
      <AppShell>{children}</AppShell>
      <LockWatchdog />
    </>
  );
}
