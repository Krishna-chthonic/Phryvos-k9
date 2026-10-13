/**
 * Tiny typed client for the vault API. Browser-side only (cookie auth is
 * automatic). Errors come back as {error:{code,message}}; locked vaults as
 * {locked:true} with 503 — the shell watchdog redirects there anyway.
 */
import type { FileMeta } from "@/lib/vault-service";

export interface SearchHit {
  path: string;
  name: string;
  isDir: boolean;
  snippet: string | null;
}

export interface VersionInfo {
  version: number;
  note: string | null;
  createdAt: number;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as T & {
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok) {
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, body?.error?.code ?? "http");
  }
  return body as T;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

function b64FromUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export const filesApi = {
  listDir: (path = "/") =>
    fetch(`/api/files?path=${encodeURIComponent(path)}`).then((r) =>
      json<{ children: FileMeta[] }>(r),
    ),
  listTrash: () => fetch(`/api/files?trash=1`).then((r) =>
    json<{ children: FileMeta[] }>(r),
  ),
  create: (path: string, type: "file" | "dir") =>
    fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, type }),
    }).then((r) => json<{ meta: FileMeta }>(r)),
  remove: (path: string) =>
    fetch(`/api/files?path=${encodeURIComponent(path)}`, { method: "DELETE" }).then(
      (r) => json<{ ok: boolean }>(r),
    ),
  restore: (path: string) =>
    fetch(`/api/files/restore?path=${encodeURIComponent(path)}`, {
      method: "POST",
    }).then((r) => json<{ ok: boolean }>(r)),
  move: (from: string, to: string) =>
    fetch("/api/files/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    }).then((r) => json<{ meta: FileMeta }>(r)),
  read: (path: string) =>
    fetch(`/api/files/content?path=${encodeURIComponent(path)}`),
  writeText: (path: string, text: string, note?: string) => {
    const b64 = b64FromUtf8(text);
    const sp = new URLSearchParams({ path });
    if (note) sp.set("note", note);
    return fetch(`/api/files/content?${sp.toString()}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataBase64: b64 }),
    }).then((r) => json<{ meta: FileMeta }>(r));
  },
  writeRaw: (path: string, bytes: ArrayBuffer, mime?: string) => {
    const sp = new URLSearchParams({ path });
    const res = fetch(`/api/files/content?${sp.toString()}`, {
      method: "PUT",
      headers: mime ? { "Content-Type": mime } : {},
      body: bytes,
    });
    return res.then((r) => json<{ meta: FileMeta }>(r));
  },
  search: (q: string) =>
    fetch(`/api/files/search?q=${encodeURIComponent(q)}`).then((r) =>
      json<{ hits: SearchHit[] }>(r),
    ),
  versions: (path: string) =>
    fetch(`/api/files/versions?path=${encodeURIComponent(path)}`).then((r) =>
      json<{ versions: VersionInfo[] }>(r),
    ),
  restoreVersion: (path: string, version: number) =>
    fetch("/api/files/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, version }),
    }).then((r) => json<{ meta: FileMeta }>(r)),
  downloadUrl: (path: string) =>
    `/api/files/content?path=${encodeURIComponent(path)}`,
};
