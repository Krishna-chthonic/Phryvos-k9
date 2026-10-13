import { redirect } from "next/navigation";
import { getVaultState } from "@/lib/auth-state";

export const dynamic = "force-dynamic";

export default async function Home() {
  const state = await getVaultState();
  redirect(
    state === "unlocked" ? "/vault" : state === "setup_required" ? "/setup" : "/unlock",
  );
}
