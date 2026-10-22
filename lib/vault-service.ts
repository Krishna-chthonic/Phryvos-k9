import type Database from "better-sqlite3";
import { gcmDecrypt, gcmEncrypt, newFileEnvelope, openFileEnvelope } from "./crypto/envelope";
import { getDb } from "./db/client";
import { ensureVaultUnlocked, VaultLockedError, QueryBuilder, paginate, whereNotDeleted, buildFtsPhrase, escapeLike, normalizeVaultPath as dalNormalizeVaultPath } from "./dal/vault-dal";

/**
 * Vault file service.
 *
 * The vault is a virtual filesystem stored in SQLite: every node (file or
 * directory) is a `files` row with an absolute vault path ("/notes/todo.md").
 * Directories are materialized rows (is_dir=1). File bytes are encrypted
 * under a per-file DEK (envelope), so this service needs the master key to
 * read/write content — metadata ops do not.
 *
 * This is the single implementation of file ops; API routes (P2) and agent
 * tools (P4) both call it, so behavior stays identical everywhere.
 *
 * Importers/callers: app/api/files/route.ts, app/api/files/content/route.ts, app/api/files/move/route.ts, app/api/files/search/route.ts, app/api/files/versions/route.ts, app/api/export/route.ts, components/vault/VaultApp.tsx
 * Affected API: All vault file operations (CRUD, search, versions, move, restore)
 * Data schemas: FileMeta, VersionInfo, SearchHit
 * User instruction verbatim: "Unified DAL enforcing lock verification before any query executes"
 */

export interface FileMeta {
  id: number;
  path: string;
  name: string;
  mime: string | null;
  sizeBytes: number | null;
  isDir: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface VaultCtx {
  db: Database.Database;
  key: Buffer;
}

export class VaultError extends Error {
  constructor(
    readonly code: "not_found" | "exists" | "not_a_dir" | "not_a_file" | "path_invalid" | "too_large",
    message: string,
  ) {
    super(message);
  }
}

export const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB
const MAX_PATH_LEN = 512;
const MAX_DEPTH = 30;
const VERSION_RETENTION = 20;

const TEXT_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/html",
  "text/css",
  "text/csv",
  "text/xml",
  "application/json",
  "application/xml",
  "application/yaml",
  "application/javascript",
  "application/typescript",
  "application/sql",
  "application/toml",
  "application/x-yaml",
  "image/svg+xml",
]);

const EXT_MIME: Record<string, string> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".json": "application/json",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".ts": "application/typescript",
  ".tsx": "application/typescript",
  ".css": "text/css",
  ".html": "text/html",
  ".htm": "text/html",
  ".xml": "application/xml",
  ".yml": "application/yaml",
  ".yaml": "application/yaml",
  ".csv": "text/csv",
  ".sql": "application/sql",
  ".toml": "application/toml",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".webm": "video/webm",
};

export function guessMime(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  return EXT_MIME[name.slice(dot).toLowerCase()] ?? null;
}

function isTextLike(mime: string | null, name: string): boolean {
  if (mime && TEXT_MIMES.has(mime)) return true;
  if (!mime) return (guessMime(name) ?? "text/plain") !== "application/octet-stream";
  return false;
}

/** Normalize + validate a vault path. "" or "/" = root. */
/** Normalize + validate a vault path. Uses DAL implementation for consistency. */
export function normalizeVaultPath(p: string): string {
  return dalNormalizeVaultPath(p);
}

function base(p: string): string {
  const i = p.lastIndexOf("/");
  return p.slice(i + 1) || "/";
}
function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

interface FileRow {
  id: number;
  path: string;
  name: string;
  mime: string | null;
  size_bytes: number | null;
  is_dir: number;
  content_enc: Buffer | null;
  nonce: Buffer | null;
  tag: Buffer | null;
  dek: Buffer | null;
  dek_nonce: Buffer | null;
  dek_tag: Buffer | null;
  version: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toMeta(r: FileRow): FileMeta {
  return {
    id: r.id,
    path: r.path,
    name: r.name,
    mime: r.mime,
    sizeBytes: r.size_bytes,
    isDir: !!r.is_dir,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

function selectMeta(ctx: VaultCtx, path: string): FileRow | undefined {
  return ctx.db
    .prepare("SELECT * FROM files WHERE path = ?")
    .get(dalNormalizeVaultPath(path)) as FileRow | undefined;
}

function ensureDir(ctx: VaultCtx, path: string): void {
  const p = normalizeVaultPath(path);
  if (p === "/") return;
  // Materialize missing ancestors as is_dir rows (root is seeded by migration).
  const parts: Array<[string, string, number, number]> = [];
  let cur = p;
  while (cur !== "/") {
    const now = Date.now();
    parts.unshift([cur, base(cur), now, now]);
    cur = dirOf(cur);
  }
  const stmt = ctx.db.prepare(
    "INSERT OR IGNORE INTO files (path, name, is_dir, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
  );
  for (const [path, name, c, u] of parts) stmt.run(path, name, c, u);
}

export function ensureRoot(db: Database.Database): void {
  db.prepare(
    "INSERT OR IGNORE INTO files (path, name, is_dir, created_at, updated_at) VALUES ('/', '/', 1, ?, ?)",
  ).run(Date.now(), Date.now());
}

// ---------------------------------------------------------------- listing

export function listDir(ctx: VaultCtx, parent: string): FileMeta[] {
  const p = normalizeVaultPath(parent);
  // Pull the prefix, then filter to direct children in JS (safe vs. LIKE
  // wildcards in user-controlled names; the vault is small enough).
  const rows =
    p === "/"
      ? (ctx.db.prepare("SELECT * FROM files WHERE deleted_at IS NULL").all() as FileRow[])
      : (ctx.db
          .prepare(
            "SELECT * FROM files WHERE path LIKE ? ESCAPE '\\' AND deleted_at IS NULL",
          )
          .all(escapeLike(p) + "/%") as FileRow[]);
  const direct = rows.filter((r) => {
    const rest = p === "/" ? r.path.slice(1) : r.path.slice(p.length + 1);
    return rest.length > 0 && !rest.includes("/");
  });
  return direct.map(toMeta).sort((a, b) =>
    a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name),
  );
}

export function getMeta(ctx: VaultCtx, path: string): FileMeta {
  const r = selectMeta(ctx, path);
  if (!r || r.deleted_at) throw new VaultError("not_found", `Not found: ${path}`);
  return toMeta(r);
}

// ---------------------------------------------------------------- create

export function createFile(ctx: VaultCtx, path: string): FileMeta {
  const p = normalizeVaultPath(path);
  const r = selectMeta(ctx, p);
  if (r && !r.deleted_at) throw new VaultError("exists", `Already exists: ${p}`);
  const now = Date.now();
  ensureDir(ctx, dirOf(p));
  if (r && r.deleted_at) {
    // reuse the row (clear old encryption state; caller writes content next)
    ctx.db
      .prepare(
        "UPDATE files SET deleted_at = NULL, content_enc = NULL, nonce = NULL, tag = NULL, dek = NULL, dek_nonce = NULL, dek_tag = NULL, mime = ?, size_bytes = NULL, version = 1, updated_at = ? WHERE id = ?",
      )
      .run(guessMime(p), now, r.id);
  } else {
    ctx.db
      .prepare(
        "INSERT INTO files (path, name, mime, is_dir, version, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?)",
      )
      .run(p, base(p), guessMime(p), now, now);
  }
  insertFilesFts(ctx, p);
  return getMeta(ctx, p);
}

export function createDir(ctx: VaultCtx, path: string): FileMeta {
  const p = normalizeVaultPath(path);
  const r = selectMeta(ctx, p);
  if (r && !r.deleted_at) throw new VaultError("exists", `Already exists: ${p}`);
  const now = Date.now();
  ensureDir(ctx, dirOf(p));
  if (r && r.deleted_at) {
    ctx.db
      .prepare("UPDATE files SET deleted_at = NULL, is_dir = 1, updated_at = ? WHERE id = ?")
      .run(now, r.id);
  } else {
    ctx.db
      .prepare(
        "INSERT INTO files (path, name, is_dir, version, created_at, updated_at) VALUES (?, ?, 1, 1, ?, ?)",
      )
      .run(p, base(p), now, now);
  }
  insertFilesFts(ctx, p);
  return getMeta(ctx, p);
}

// ---------------------------------------------------------------- read

export function readFile(ctx: VaultCtx, path: string): { bytes: Buffer; mime: string | null } {
  const r = selectMeta(ctx, path);
  if (!r || r.deleted_at || r.is_dir)
    throw new VaultError("not_a_file", `Not a file: ${path}`);
  if (!r.content_enc || !r.dek) {
    return { bytes: Buffer.alloc(0), mime: r.mime }; // empty file
  }
  const dek = openFileEnvelope(
    ctx.key,
    {
      dekEnc: r.dek,
      dekNonce: r.dek_nonce!,
      dekTag: r.dek_tag!,
    },
    `file:${r.id}`,
  );
  const bytes = gcmDecrypt(dek, {
    enc: r.content_enc,
    nonce: r.nonce!,
    tag: r.tag!,
  });
  return { bytes, mime: r.mime };
}

// ---------------------------------------------------------------- write

function contentIsTextForFts(r: FileRow, bytes: Buffer): boolean {
  const textLike = isTextLike(r.mime, r.name);
  if (!textLike) return false;
  if (bytes.length > 2_000_000) return false; // don't index huge blobs
  return !bytes.includes(0);
}

/**
 * Keep version history bounded: last 20 + one per calendar day. Call AFTER
 * the new version is in place, so snapshots reference content rows already
 * written into file_versions in the same transaction.
 */
function snapshotVersion(ctx: VaultCtx, fileId: number): void {
  const rows = ctx.db
    .prepare("SELECT * FROM file_versions WHERE file_id = ? ORDER BY version DESC")
    .all(fileId) as Array<{ id: number; created_at: number }>;
  if (rows.length === 0) return;

  const keep = new Set<number>();
  rows.slice(0, VERSION_RETENTION).forEach((x) => keep.add(x.id));
  const seenDays = new Set<string>();
  for (const x of rows) {
    const day = new Date(x.created_at).toISOString().slice(0, 10);
    if (!seenDays.has(day)) {
      seenDays.add(day);
      keep.add(x.id);
    }
  }
  const stale = rows.filter((x) => !keep.has(x.id)).map((x) => x.id);
  if (stale.length) {
    const stmt = ctx.db.prepare("DELETE FROM file_versions WHERE id = ?");
    stale.forEach((id) => stmt.run(id));
  }
}

export function writeFile(
  ctx: VaultCtx,
  path: string,
  data: Buffer | Uint8Array | string,
  note?: string,
): FileMeta {
  const bytes =
    typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  if (bytes.length > MAX_FILE_BYTES)
    throw new VaultError("too_large", `File exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB limit`);
  const p = normalizeVaultPath(path);
  const now = Date.now();

  const tx = ctx.db.transaction(() => {
    const r = selectMeta(ctx, p);
    if (!r || r.deleted_at || r.is_dir)
      throw new VaultError("not_a_file", `Not a writable file: ${p}`);

    // Snapshot the previous version. The version row is self-contained: it
    // stores the old ciphertext AND the old DEK's envelope, so it stays
    // restorable independently of the current envelope.
    if (r.content_enc && r.dek) {
      ctx.db
        .prepare(
          `INSERT INTO file_versions (file_id, version, note, content_enc, nonce, tag, dek, dek_nonce, dek_tag, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          r.id,
          r.version,
          note ?? "auto",
          r.content_enc,
          r.nonce,
          r.tag,
          r.dek,
          r.dek_nonce,
          r.dek_tag,
          now,
        );
    }

    const env = newFileEnvelope(ctx.key, `file:${r.id}`);
    const blob = gcmEncrypt(env.dek, bytes);
    ctx.db
      .prepare(
        `UPDATE files SET content_enc = ?, nonce = ?, tag = ?, dek = ?, dek_nonce = ?, dek_tag = ?,
         size_bytes = ?, mime = COALESCE(mime, ?), version = version + 1, updated_at = ? WHERE id = ?`,
      )
      .run(
        blob.enc,
        blob.nonce,
        blob.tag,
        env.dekEnc,
        env.dekNonce,
        env.dekTag,
        bytes.length,
        guessMime(p),
        now,
        r.id,
      );

    // content FTS (text files only)
    ctx.db.prepare("DELETE FROM file_content_fts WHERE file_id = ?").run(r.id);
    if (contentIsTextForFts(r, bytes)) {
      ctx.db
        .prepare("INSERT INTO file_content_fts (file_id, body) VALUES (?, ?)")
        .run(r.id, bytes.toString("utf8"));
    }

    snapshotVersion(ctx, r.id);
  });
  tx();

  return getMeta(ctx, p);
}

// ---------------------------------------------------------------- move

export function moveFile(ctx: VaultCtx, from: string, to: string): FileMeta {
  const f = normalizeVaultPath(from);
  const t = normalizeVaultPath(to);
  if (f === t) return getMeta(ctx, f);
  const r = selectMeta(ctx, f);
  if (!r || r.deleted_at) throw new VaultError("not_found", `Not found: ${f}`);

  const now = Date.now();
  const isDirMove = !!r.is_dir;

  const tx = ctx.db.transaction(() => {
    if (isDirMove) {
      // moving a directory: re-root all descendants
      const affected = ctx.db
        .prepare("SELECT path FROM files WHERE path LIKE ? AND path != ?")
        .all(f + "/%", f) as Array<{ path: string }>;
      const upd = ctx.db.prepare("UPDATE files SET path = ?, updated_at = ? WHERE path = ?");
      for (const a of affected) {
        upd.run(t + a.path.slice(f.length), now, a.path);
      }
      ctx.db.prepare("UPDATE files SET path = ?, updated_at = ? WHERE id = ?").run(t, now, r.id);
      // name/path FTS rebuilds; content FTS is keyed by file_id → still valid
      ctx.db.prepare("DELETE FROM files_fts WHERE path LIKE ? ESCAPE '\\'").run(escapeLike(f + "/"));
      const rows = ctx.db
        .prepare(
          "SELECT name, path FROM files WHERE (path LIKE ? ESCAPE '\\' OR path = ?) AND deleted_at IS NULL",
        )
        .all(escapeLike(t) + "/%", t) as Array<{ name: string; path: string }>;
      const ins = ctx.db.prepare("INSERT INTO files_fts (name, path) VALUES (?, ?)");
      for (const x of rows) ins.run(x.name, x.path);
    } else {
      const target = selectMeta(ctx, t);
      if (target && !target.deleted_at)
        throw new VaultError("exists", `Destination exists: ${t}`);
      ensureDir(ctx, dirOf(t));
      if (target && target.deleted_at) {
        // a soft-deleted row occupies the destination path: it is trash, so
        // purge it (row + versions + content index) before re-occupying
        ctx.db.prepare("DELETE FROM file_versions WHERE file_id = ?").run(target.id);
        ctx.db.prepare("DELETE FROM file_content_fts WHERE file_id = ?").run(target.id);
        ctx.db.prepare("DELETE FROM files_fts WHERE path = ?").run(escapeLike(t));
        ctx.db.prepare("DELETE FROM files WHERE id = ?").run(target.id);
      }
      ctx.db
        .prepare("UPDATE files SET path = ?, name = ?, updated_at = ? WHERE id = ?")
        .run(t, base(t), now, r.id);
      ctx.db.prepare("DELETE FROM files_fts WHERE path = ?").run(escapeLike(f));
      insertFilesFts(ctx, t);
    }
  });
  tx();

  return getMeta(ctx, t);
}

function insertFilesFts(ctx: VaultCtx, path: string): void {
  const r = ctx.db
    .prepare("SELECT name FROM files WHERE path = ?")
    .get(path) as { name: string } | undefined;
  if (!r) return;
  ctx.db.prepare("INSERT INTO files_fts (name, path) VALUES (?, ?)").run(r.name, path);
}

// ---------------------------------------------------------------- delete / restore

export function deleteFile(ctx: VaultCtx, path: string): void {
  const p = normalizeVaultPath(path);
  const r = selectMeta(ctx, p);
  if (!r || r.deleted_at) throw new VaultError("not_found", `Not found: ${p}`);
  const now = Date.now();
  const tx = ctx.db.transaction(() => {
    if (r.is_dir) {
      ctx.db
        .prepare("UPDATE files SET deleted_at = ? WHERE path = ? OR path LIKE ?")
        .run(now, p, p + "/%");
      ctx.db
        .prepare("DELETE FROM files_fts WHERE path = ? OR path LIKE ?")
        .run(escapeLike(p), p + "/");
      const ids = ctx.db
        .prepare("SELECT id FROM files WHERE (path = ? OR path LIKE ?) AND deleted_at = ?")
        .all(p, p + "/%", now) as Array<{ id: number }>;
      const del = ctx.db.prepare("DELETE FROM file_content_fts WHERE file_id = ?");
      ids.forEach((x) => del.run(x.id));
    } else {
      ctx.db.prepare("UPDATE files SET deleted_at = ? WHERE id = ?").run(now, r.id);
      ctx.db.prepare("DELETE FROM files_fts WHERE path = ?").run(p);
      ctx.db.prepare("DELETE FROM file_content_fts WHERE file_id = ?").run(r.id);
    }
  });
  tx();
}

/**
 * Permanently purge a file or directory tree:
 * Deletes from `files`, all past versions from `file_versions`, FTS indexes,
 * vector chunks, and triggers incremental_vacuum to overwrite freed pages.
 */
export function purgeFile(ctx: VaultCtx, path: string): void {
  const p = normalizeVaultPath(path);
  const r = selectMeta(ctx, p);
  if (!r) throw new VaultError("not_found", `Not found: ${p}`);

  const tx = ctx.db.transaction(() => {
    if (r.is_dir) {
      const ids = ctx.db
        .prepare("SELECT id FROM files WHERE path = ? OR path LIKE ?")
        .all(p, p + "/%") as Array<{ id: number }>;
      const delVer = ctx.db.prepare("DELETE FROM file_versions WHERE file_id = ?");
      const delFts = ctx.db.prepare("DELETE FROM file_content_fts WHERE file_id = ?");
      for (const row of ids) {
        delVer.run(row.id);
        delFts.run(row.id);
      }
      ctx.db.prepare("DELETE FROM files_fts WHERE path = ? OR path LIKE ?").run(escapeLike(p), p + "/%");
      ctx.db.prepare("DELETE FROM files WHERE path = ? OR path LIKE ?").run(p, p + "/%");
    } else {
      ctx.db.prepare("DELETE FROM file_versions WHERE file_id = ?").run(r.id);
      ctx.db.prepare("DELETE FROM file_content_fts WHERE file_id = ?").run(r.id);
      ctx.db.prepare("DELETE FROM files_fts WHERE path = ?").run(escapeLike(p));
      ctx.db.prepare("DELETE FROM files WHERE id = ?").run(r.id);
    }
    try {
      ctx.db.prepare("DELETE FROM file_chunks WHERE file_path = ? OR file_path LIKE ?").run(p, p + "/%");
    } catch {
      // file_chunks table may not exist
    }
  });
  tx();
  try {
    ctx.db.pragma("incremental_vacuum(10)");
  } catch {
    // pragma fallback
  }
}

export function restoreFile(ctx: VaultCtx, path: string): void {
  const p = normalizeVaultPath(path);
  const r = selectMeta(ctx, p);
  if (!r || !r.deleted_at)
    throw new VaultError("not_found", `Not deleted (or missing): ${p}`);
  const now = Date.now();
  const tx = ctx.db.transaction(() => {
    if (r.is_dir) {
      ctx.db
        .prepare(
          "UPDATE files SET deleted_at = NULL, updated_at = ? WHERE (path = ? OR path LIKE ?) AND deleted_at = ?",
        )
        .run(now, p, p + "/%", now);
      const rows = ctx.db
        .prepare("SELECT name, path FROM files WHERE path LIKE ?")
        .all(p + "/%") as Array<{ name: string; path: string }>;
      const ins = ctx.db.prepare("INSERT INTO files_fts (name, path) VALUES (?, ?)");
      for (const x of rows) ins.run(x.name, x.path);
    } else {
      const i = p.lastIndexOf("/");
      const parent = i <= 0 ? "/" : p.slice(0, i);
      if (parent !== "/") {
        const prow = ctx.db
          .prepare("SELECT deleted_at FROM files WHERE path = ?")
          .get(parent) as { deleted_at: number | null } | undefined;
        if (prow?.deleted_at)
          throw new VaultError("not_found", `Parent is in trash: ${parent}. Restore the parent first.`);
      }
      ctx.db.prepare("UPDATE files SET deleted_at = NULL, updated_at = ? WHERE id = ?").run(now, r.id);
      insertFilesFts(ctx, p);
    }
  });
  tx();
}

/** Soft-deleted top-level entries (trash / undo affordance). */
export function listTrash(ctx: VaultCtx): FileMeta[] {
  // Show every deleted entry whose parent is NOT itself in the trash, so a
  // soft-deleted directory appears as one entry (restoring it brings back
  // the subtree) and a deleted file only shows up when its parent is alive.
  const rows = ctx.db
    .prepare("SELECT * FROM files WHERE deleted_at IS NOT NULL AND path != '/'")
    .all() as FileRow[];
  const deletedPaths = new Set(rows.map((r) => r.path));
  return rows
    .filter((r) => {
      const i = r.path.lastIndexOf("/");
      const parent = i <= 0 ? "/" : r.path.slice(0, i);
      return parent === "/" || !deletedPaths.has(parent);
    })
    .map(toMeta)
    .sort((a, b) =>
      a.isDir === b.isDir ? a.path.localeCompare(b.path) : a.isDir ? -1 : 1,
    );
}

// ---------------------------------------------------------------- versions

export interface VersionInfo {
  version: number;
  note: string | null;
  createdAt: number;
}

export function listVersions(ctx: VaultCtx, path: string): VersionInfo[] {
  const r = selectMeta(ctx, path);
  if (!r || r.deleted_at || r.is_dir)
    throw new VaultError("not_a_file", `Not a file: ${path}`);
  const rows = ctx.db
    .prepare(
      "SELECT version, note, created_at FROM file_versions WHERE file_id = ? ORDER BY version DESC",
    )
    .all(r.id) as Array<{ version: number; note: string | null; created_at: number }>;
  return rows.map((x) => ({ version: x.version, note: x.note, createdAt: x.created_at }));
}

export function restoreVersion(ctx: VaultCtx, path: string, version: number): FileMeta {
  const r = selectMeta(ctx, path);
  if (!r || r.deleted_at || r.is_dir)
    throw new VaultError("not_a_file", `Not a file: ${path}`);
  const v = ctx.db
    .prepare("SELECT * FROM file_versions WHERE file_id = ? AND version = ?")
    .get(r.id, version) as
    | {
        content_enc: Buffer | null;
        nonce: Buffer | null;
        tag: Buffer | null;
        dek: Buffer | null;
        dek_nonce: Buffer | null;
        dek_tag: Buffer | null;
      }
    | undefined;
  if (!v) throw new VaultError("not_found", `Version ${version} not found`);

  // decrypt the old content under its own stored DEK (unwrapped under the
  // master key), re-encrypt as a NEW version
  let oldBytes: Buffer;
  if (v.content_enc && v.dek) {
    const dek = openFileEnvelope(ctx.key, { dekEnc: v.dek, dekNonce: v.dek_nonce!, dekTag: v.dek_tag! });
    oldBytes = gcmDecrypt(dek, { enc: v.content_enc, nonce: v.nonce!, tag: v.tag! });
  } else {
    oldBytes = Buffer.alloc(0);
  }
  return writeFile(ctx, path, oldBytes, `restored v${version}`);
}

// ---------------------------------------------------------------- search

function ftsPhrase(q: string): string {
  const toks = q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"`);
  return toks.join(" OR ") || '""';
}

export interface SearchHit {
  path: string;
  name: string;
  isDir: boolean;
  snippet: string | null;
}

export function search(ctx: VaultCtx, query: string): SearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const out = new Map<string, SearchHit>();

  // name + path matches
  const nameRows = ctx.db
    .prepare(
      `SELECT f.path, f.name, f.is_dir FROM files f
       WHERE f.deleted_at IS NULL AND f.path != '/'
         AND f.path IN (SELECT path FROM files_fts WHERE files_fts MATCH ?)`,
    )
    .all(ftsPhrase(q)) as Array<{ path: string; name: string; is_dir: number }>;
  for (const r of nameRows) {
    out.set(r.path, { path: r.path, name: r.name, isDir: !!r.is_dir, snippet: null });
  }

  // content matches (text files)
  const contentRows = ctx.db
    .prepare(
      `SELECT f.path, f.name, snippet(file_content_fts, 1, '⏴', '⏵', '…', 60) AS snip
       FROM file_content_fts c JOIN files f ON f.id = c.file_id
       WHERE f.deleted_at IS NULL AND file_content_fts MATCH ?`,
    )
    .all(ftsPhrase(q)) as Array<{ path: string; name: string; snip: string }>;
  for (const r of contentRows) {
    const cur = out.get(r.path);
    if (cur) cur.snippet = r.snip;
    else out.set(r.path, { path: r.path, name: r.name, isDir: false, snippet: r.snip });
  }

  return [...out.values()].sort((a, b) => a.path.localeCompare(b.path));
}

// ---------------------------------------------------------------- helpers

// Re-export DAL helpers for consistency
export { escapeLike, buildFtsPhrase as ftsPhrase, whereNotDeleted, QueryBuilder, paginate, VaultLockedError } from "./dal/vault-dal";

/** Open the DB handle (used by routes before ctx is built). */
export function openVaultDb(): Database.Database {
  return getDb();
}
