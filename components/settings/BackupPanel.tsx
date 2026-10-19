/**
 * P7: backup panel UI — importers: app/(app)/settings/page.tsx line 6 (imported & rendered).
 * Callers: calls /api/backups GET/POST/DELETE, /api/backups/restore POST.
 * Affected APIs: backup CRUD + restore endpoint.
 * Data schemas: backups table (id, kind, path TEXT, size_bytes INTEGER, created_at INTEGER UTC ms).
 * User instruction verbatim: "continue"
 */
"use client";

import * as React from "react";
import { Plus, Trash2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BackupEntry } from "@/lib/backup-service";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, opts);
  const body = (await res.json().catch(() => null)) as T & {
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return body as T;
}

export function BackupPanel() {
  const [backups, setBackups] = React.useState<BackupEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [runKind, setRunKind] = React.useState<"manual" | "export">("manual");
  const [restoring, setRestoring] = React.useState(false);
  const [restorePath, setRestorePath] = React.useState("");

  React.useEffect(() => {
    loadBackups();
  }, []);

  async function loadBackups() {
    setLoading(true);
    try {
      const data = await apiFetch<{ backups: BackupEntry[] }>("/api/backups");
      setBackups(data.backups);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleRunNow() {
    try {
      await apiFetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: runKind }),
      });
      await loadBackups();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/api/backups/${id}`, { method: "DELETE" });
      await loadBackups();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRestore() {
    if (!restorePath.trim()) return;
    setRestoring(true);
    try {
      await apiFetch("/api/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: restorePath.trim() }),
      });
      setRestorePath("");
      // After restore, session is invalidated — redirect to unlock
      window.location.href = "/unlock";
    } catch (e) {
      setError(String(e));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Backups & Export</h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Create full export bundles, manage backups, and restore from a zip.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Run now */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h3 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">Create Backup / Export</h3>
        <div className="flex items-center gap-3">
          <select
            value={runKind}
            onChange={(e) => setRunKind(e.target.value as "manual" | "export")}
            className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm outline-none"
          >
            <option value="manual">Manual backup</option>
            <option value="export">Export bundle</option>
          </select>
          <Button variant="primary" onClick={handleRunNow} disabled={loading}>
            <Plus className="mr-1 h-4 w-4" />
            {loading ? "Running..." : "Run Now"}
          </Button>
        </div>
      </div>

      {/* Backup list */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h3 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Backups ({backups.length})
        </h3>
        {loading && backups.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400 dark:text-zinc-500">Loading...</p>
        ) : backups.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400 dark:text-zinc-500">No backups yet.</p>
        ) : (
          <div className="space-y-2">
            {backups.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-zinc-100 dark:border-zinc-800 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      b.kind === "export"
                        ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400"
                        : b.kind === "manual"
                        ? "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                    }`}
                  >
                    {b.kind}
                  </span>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{b.path.split("/").pop()}</span>
                  {b.sizeBytes != null && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {(b.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {new Date(b.createdAt).toLocaleString()}
                  </span>
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="rounded p-1 text-zinc-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    title="Delete backup"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restore */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h3 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">Restore from Zip</h3>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Provide the full path to a backup zip file (must exist on disk). Restoring will
          replace the current vault data and invalidate all sessions.
        </p>
        <div className="flex gap-2">
          <Input
            value={restorePath}
            onChange={(e) => setRestorePath(e.target.value)}
            placeholder="/path/to/backup-2024-...zip"
            className="flex-1"
          />
          <Button
            variant="secondary"
            onClick={handleRestore}
            disabled={restoring || !restorePath.trim()}
          >
            <RotateCw className="mr-1 h-4 w-4" />
            {restoring ? "Restoring..." : "Restore"}
          </Button>
        </div>
      </div>
    </div>
  );
}
