"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SetupPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setBusy(false);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }
    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      setError(json.error?.message ?? "Setup failed. Is the app already initialized?");
      setBusy(false);
      return;
    }
    router.replace("/vault");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <h1 className="text-lg font-semibold tracking-tight">
            phryvos k9 — create your vault
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
          <Input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating vault…" : "Create vault"}
          </Button>
          <p className="text-xs leading-relaxed text-zinc-500">
            This password encrypts everything in your vault (files, chat,
            provider keys). If you lose it, the data cannot be recovered.
          </p>
        </form>
      </div>
    </div>
  );
}
