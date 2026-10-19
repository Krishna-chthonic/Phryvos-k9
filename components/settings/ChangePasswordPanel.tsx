/**
 * P7: change password panel UI — importers: app/(app)/settings/page.tsx line 7.
 * Callers: calls POST /api/auth/change-password.
 * Affected APIs: password change / re-key endpoint.
 * Data schemas: auth(salt BLOB, verifier BLOB), all encrypted columns re-keyed.
 * User instruction verbatim: "continue"
 */
"use client";

import * as React from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, opts);
  const body = (await res.json().catch(() => null)) as T & {
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

export function ChangePasswordPanel() {
  const [oldPwd, setOldPwd] = React.useState("");
  const [newPwd, setNewPwd] = React.useState("");
  const [confirmPwd, setConfirmPwd] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  async function handleChangePassword() {
    if (newPwd !== confirmPwd) {
      setError("New passwords do not match");
      return;
    }
    if (newPwd.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      });
      setSuccess(true);
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Master Password</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Changing your password re-encrypts all vault data under the new master key.
          Sessions will be invalidated and you must re-unlock.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 dark:border-green-900/60 bg-green-50 dark:bg-green-950/40 p-3 text-sm text-green-700 dark:text-green-300">
          <ShieldCheck className="mr-2 inline h-4 w-4" />
          Password changed successfully. You will be redirected to unlock.
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Current Password
          </label>
          <Input
            type="password"
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
            placeholder="Enter current password"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            New Password
          </label>
          <Input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Confirm New Password
          </label>
          <Input
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            placeholder="Re-enter new password"
          />
        </div>
        <Button
          variant="destructive"
          className="w-full"
          onClick={handleChangePassword}
          disabled={loading || !oldPwd || !newPwd || !confirmPwd}
        >
          <KeyRound className="mr-2 h-4 w-4" />
          {loading ? "Re-keying vault..." : "Change Password"}
        </Button>
      </div>
    </div>
  );
}
