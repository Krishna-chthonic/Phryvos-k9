"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UnlockPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
      };
      if (res.status === 409 && json.error?.code === "setup_required") {
        router.replace("/setup");
        return;
      }
      setError(json.error?.message ?? "Could not unlock the vault.");
      setBusy(false);
      return;
    }
    router.replace("/vault");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <Lock className="h-5 w-5" />
          <h1 className="text-lg font-semibold tracking-tight">
            phryvos k9 — unlock
          </h1>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <Input
            type="password"
            placeholder="Vault password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy || password.length === 0} className="w-full">
            {busy ? "Unlocking…" : "Unlock"}
          </Button>
        </form>
      </div>
    </div>
  );
}
