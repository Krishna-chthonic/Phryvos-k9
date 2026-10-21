"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { authApi } from "@/lib/api/client";
import { keyring } from "@/lib/keyring";

export default function SetupPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [duressPin, setDuressPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (password.length < 8) {
      setError("Master password must be at least 8 characters");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    if (duressPin && duressPin === password) {
      setError("Duress PIN cannot be identical to the master password");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await authApi.setup(password, duressPin || undefined);
      if (res.ok || res.success || res.state === "unlocked") {
        // Unlock immediately with the new password
        const unlockRes = await authApi.unlock(password);
        if (unlockRes.ok || unlockRes.success || unlockRes.state === "unlocked") {
          keyring.setUnlocked(true);
          router.replace("/chat");
        } else {
          router.replace("/unlock");
        }
      } else {
        setError("Setup failed. Vault may already be initialized.");
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "Failed to initialize vault");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[var(--bg-0)] text-[var(--fg-0)] select-none">
      <div className="w-full max-w-[360px] flex flex-col items-center text-center">
        {/* Geometric Logo Mark */}
        <div className="h-12 w-12 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center mb-4 text-[var(--accent)] shadow-none">
          <ShieldCheck className="h-6 w-6 stroke-[1.5]" />
        </div>

        {/* Title */}
        <h1 className="text-[var(--text-xl)] font-semibold text-[var(--fg-0)] tracking-tight">
          Initialize Phryvos Vault
        </h1>
        <p className="text-[var(--text-sm)] text-[var(--fg-2)] mt-1.5 mb-8">
          Create master password for envelope encryption
        </p>

        {/* Form */}
        <form onSubmit={handleSetup} className="w-full space-y-4 text-left">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-[var(--radius-sm)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 text-[var(--danger)] text-[var(--text-xs)]">
              <AlertCircle className="h-4 w-4 shrink-0 stroke-[1.5]" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[var(--text-xs)] font-medium text-[var(--fg-1)] mb-1.5">
              Master Password (min 8 chars)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoFocus
              disabled={loading}
              className="w-full h-[40px] px-3.5 bg-[var(--bg-1)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text-base)] text-[var(--fg-0)] placeholder:text-[var(--fg-2)] outline-none transition-colors duration-120 focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
            />
          </div>

          <div>
            <label className="block text-[var(--text-xs)] font-medium text-[var(--fg-1)] mb-1.5">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••••••"
              disabled={loading}
              className="w-full h-[40px] px-3.5 bg-[var(--bg-1)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text-base)] text-[var(--fg-0)] placeholder:text-[var(--fg-2)] outline-none transition-colors duration-120 focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
            />
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[var(--text-xs)] font-medium text-[var(--fg-1)]">
                Duress PIN (Optional)
              </label>
              <span className="text-[10px] text-[var(--fg-3)]">Decoy vault</span>
            </div>
            <input
              type="password"
              value={duressPin}
              onChange={(e) => setDuressPin(e.target.value)}
              placeholder="Alternative emergency PIN"
              disabled={loading}
              className="w-full h-[40px] px-3.5 bg-[var(--bg-1)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text-base)] text-[var(--fg-0)] placeholder:text-[var(--fg-2)] outline-none transition-colors duration-120 focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full h-[40px] mt-2 px-4 rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--accent-fg)] text-[var(--text-md)] font-medium transition-colors hover:bg-[var(--accent-hover)] active:bg-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 outline-none focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          >
            {loading ? "Creating Vault..." : "Create Encrypted Vault"}
          </button>
        </form>

        <p className="text-[11px] text-[var(--fg-3)] mt-8">
          scrypt N=32768 derivation &middot; AES-256-GCM authenticated encryption
        </p>
      </div>
    </div>
  );
}
