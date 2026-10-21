"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Shield, AlertCircle } from "lucide-react";
import { authApi } from "@/lib/api/client";
import { keyring } from "@/lib/keyring";

export default function UnlockPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Check auth status on load
  React.useEffect(() => {
    authApi.status()
      .then((res) => {
        if (res.state === "unlocked") {
          keyring.setUnlocked(true);
          router.replace("/chat");
        } else if (res.state === "setup_required") {
          router.replace("/setup");
        }
      })
      .catch(() => {
        // Vault locked or offline
      });
  }, [router]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await authApi.unlock(password);
      if (res.ok || res.success || res.state === "unlocked") {
        keyring.setUnlocked(true);
        router.replace("/chat");
      } else {
        setError("Invalid master password or PIN");
        setLoading(false);
      }
    } catch (err: any) {
      if (err.status === 409 && err.code === "setup_required") {
        router.replace("/setup");
        return;
      }
      setError(err.message || "Failed to unlock vault");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[var(--bg-0)] text-[var(--fg-0)] select-none">
      <div className="w-full max-w-[340px] flex flex-col items-center text-center">
        {/* Geometric Logo Mark */}
        <div className="h-12 w-12 rounded-[var(--radius-md)] bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center mb-4 text-[var(--accent)] shadow-none">
          <Shield className="h-6 w-6 stroke-[1.5]" />
        </div>

        {/* Title */}
        <h1 className="text-[var(--text-xl)] font-semibold text-[var(--fg-0)] tracking-tight">
          Phryvos Vault
        </h1>
        <p className="text-[var(--text-sm)] text-[var(--fg-2)] mt-1.5 mb-8">
          Enter master password to unlock workspace
        </p>

        {/* Form */}
        <form onSubmit={handleUnlock} className="w-full space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-[var(--radius-sm)] bg-[var(--danger-soft)] border border-[var(--danger)]/30 text-[var(--danger)] text-[var(--text-xs)] text-left">
              <AlertCircle className="h-4 w-4 shrink-0 stroke-[1.5]" />
              <span>{error}</span>
            </div>
          )}

          <div className="relative w-full">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Master password or Duress PIN"
              autoFocus
              disabled={loading}
              className="w-full h-[44px] px-3.5 pr-11 bg-[var(--bg-1)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text-base)] text-[var(--fg-0)] placeholder:text-[var(--fg-2)] outline-none transition-colors duration-120 focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--fg-2)] hover:text-[var(--fg-0)] transition-colors outline-none"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 stroke-[1.5]" />
              ) : (
                <Eye className="h-4 w-4 stroke-[1.5]" />
              )}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full h-[40px] px-4 rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--accent-fg)] text-[var(--text-md)] font-medium transition-colors hover:bg-[var(--accent-hover)] active:bg-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 outline-none focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          >
            {loading ? (
              <>
                <svg
                  className="h-[14px] w-[14px] animate-spin shrink-0 text-current"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-90"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Unlocking...</span>
              </>
            ) : (
              <span>Unlock Vault</span>
            )}
          </button>
        </form>

        {/* Security Invariant Label */}
        <p className="text-[11px] text-[var(--fg-3)] mt-8">
          Local-first envelope encrypted &middot; Zero telemetry
        </p>
      </div>
    </div>
  );
}
