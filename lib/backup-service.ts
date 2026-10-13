/**
 * P7: export/backup/re-key service layer.
 *
 * Importers/callers (created this session):
 *   - app/api/export/route.ts              (POST /api/export)
 *   - app/api/backups/route.ts             (GET /api/backups, POST /api/backups/run-now)
 *   - app/api/backups/[id]/route.ts        (DELETE /api/backups/:id)
 *   - app/api/auth/change-password/route.ts (POST /api/auth/change-password)
 *   - components/settings/BackupPanel.tsx  (UI panel for backups)
 *
 * No existing file serves this purpose (verified: grep of lib/ found no archiver/backup usage).
 *
 * Data schemas affected:
 *   - backups(id INTEGER PK, kind TEXT CHECK IN ('auto','manual','export'),
 *             path TEXT, size_bytes INTEGER, created_at INTEGER UTC ms)
 *   - Re-key touches encrypted columns in: ai_providers, chat_sessions,
 *     chat_messages, study_logs, files (DEK envelope only; content BLOBs untouched)
 *
 * User instruction verbatim: "continue"
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { derive, splitMaster, checkPassword } from "@/lib/crypto/kdf";
import { gcmEncrypt, gcmDecrypt } from "@/lib/crypto/envelope";
import { getDb } from "@/lib/db/client";
import { destroySession } from "@/lib/session/store";

// ------------------------------------------------------------ dirs

const BACKUPS_DIR = path.join(process.cwd(), "backups");
const EXPORT_DIR = path.join(process.cwd(), "exports");

export function ensureBackupsDir(): void {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// ------------------------------------------------------------ helpers

function stamp(prefix: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${ts}.zip`;
}

// ------------------------------------------------------------ export

export interface ExportResult {
  path: string;
  sizeBytes: number;
  createdAt: number;
}

/**
 * Create a full export/backup bundle.
 *
 * Contents: vault.db (live VACUUM snapshot), manifest.json.
 * File content BLOBs are stored encrypted in the DB; they travel as-is.
 * Uses shell `zip` for simplicity — acceptable for single-user local app.
 */
export function createExportBundle(kind: "auto" | "manual" | "export"): ExportResult {
  ensureBackupsDir();
  const db = getDb();
  const now = Date.now();
  const filename = stamp(kind);
  const dest = path.join(kind === "export" ? EXPORT_DIR : BACKUPS_DIR, filename);
  const tmpDb = path.join(
    kind === "export" ? EXPORT_DIR : BACKUPS_DIR,
    `tmp-${now}.db`,
  );

  // VACUUM snapshot: creates a fresh compact DB at tmpDb
  db.backup(tmpDb);

  // Manifest
  const manifest = JSON.stringify(
    {
      kind,
      created_at: now,
      version: "1.0",
      kdf_params: { name: "scrypt", N: 32768, r: 8, p: 1, len: 64 },
    },
    null,
    2,
  );
  const manifestPath = path.join(path.dirname(dest), `manifest-${now}.json`);
  fs.writeFileSync(manifestPath, manifest);

  try {
    execSync(`zip -j "${dest}" "${tmpDb}" "${manifestPath}"`);
  } finally {
    fs.unlinkSync(tmpDb);
    fs.unlinkSync(manifestPath);
  }

  const size = fs.statSync(dest).size;
  db.prepare(
    `INSERT INTO backups (kind, path, size_bytes, created_at) VALUES (?, ?, ?, ?)`,
  ).run(kind, dest, size, now);

  return { path: dest, sizeBytes: size, createdAt: now };
}

// ------------------------------------------------------------ list / delete backups

export interface BackupEntry {
  id: number;
  kind: "auto" | "manual" | "export";
  path: string;
  sizeBytes: number | null;
  createdAt: number;
}

export function listBackups(): BackupEntry[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, kind, path, size_bytes, created_at
    FROM backups
    ORDER BY created_at DESC
  `).all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number,
    kind: r.kind as "auto" | "manual" | "export",
    path: r.path as string,
    sizeBytes: (r.size_bytes as number | null) ?? null,
    createdAt: r.created_at as number,
  }));
}

export function deleteBackup(id: number): void {
  const db = getDb();
  const row = db.prepare("SELECT path FROM backups WHERE id = ?").get(id) as
    | { path: string }
    | undefined;
  if (!row) throw new Error(`Backup ${id} not found`);
  try {
    fs.unlinkSync(row.path);
  } catch {
    // best-effort
  }
  db.prepare("DELETE FROM backups WHERE id = ?").run(id);
}

// ------------------------------------------------------------ restore

export interface RestoreResult {
  ok: boolean;
  filesCount: number;
}

/**
 * Restore from a backup zip.
 * The zip must contain a `vault.db` at its root.
 * Drops all current data and replaces it with the snapshot. Sessions are invalidated.
 */
export function restoreBackup(backupPath: string): RestoreResult {
  ensureBackupsDir();
  if (!fs.existsSync(backupPath)) throw new Error(`Backup not found: ${backupPath}`);

  const tmpDir = path.join(BACKUPS_DIR, `restore-tmp-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`unzip -o "${backupPath}" -d "${tmpDir}"`);
    const restoredDbPath = path.join(tmpDir, "vault.db");
    if (!fs.existsSync(restoredDbPath)) throw new Error("Backup does not contain vault.db");

    const currentDb = getDb();
    const currentPath = currentDb.name;
    currentDb.close();

    fs.copyFileSync(restoredDbPath, currentPath);
    const newDb = new Database(currentPath);
    newDb.pragma("journal_mode = WAL");
    newDb.pragma("busy_timeout = 5000");
    newDb.pragma("foreign_keys = ON");

    // Update globalThis singleton (same pattern as lib/db/client.ts)
    const g = globalThis as unknown as {
      __phryvosDb?: Database.Database;
      __phryvosDbPath?: string;
    };
    g.__phryvosDb = newDb;
    g.__phryvosDbPath = currentPath;

    const count = newDb.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number };
    destroySession(null);

    return { ok: true, filesCount: count.n };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

// ------------------------------------------------------------ re-key (password change)

export interface ReKeyResult {
  providersRekeyed: number;
  chatSessionsRekeyed: number;
  chatMessagesRekeyed: number;
  studyLogsRekeyed: number;
  filesRekeyed: number;
}

/**
 * Change the vault password.
 *
 * Procedure:
 *  1. Verify old password against stored verifier.
 *  2. Derive new master key from new password.
 *  3. Re-encrypt all GCM-wrapped columns under the new master key.
 *  4. Update auth salt + verifier.
 *  5. Invalidate all sessions.
 *
 * Columns touched:
 *   - ai_providers.api_key/key_nonce/key_tag
 *   - chat_sessions.title_enc/title_nonce/title_tag,
 *     summary_enc/summary_nonce/summary_tag
 *   - chat_messages.content_enc/content_nonce/content_tag
 *   - study_logs.notes_enc/notes_nonce/notes_tag
 *   - files.dek/dek_nonce/dek_tag (DEK wrapping only; content BLOBs untouched)
 */
export function rekeyVault(oldPassword: string, newPassword: string): ReKeyResult {
  const db = getDb();

  const oldRow = db.prepare("SELECT kdf, salt, verifier FROM auth LIMIT 1").get() as
    | { kdf: string; salt: Buffer; verifier: Buffer }
    | undefined;
  if (!oldRow) throw new Error("No auth row found");
  if (!checkPassword(oldPassword, oldRow.salt, oldRow.verifier))
    throw new Error("Current password is incorrect");

  const newSalt = randomBytes(32);
  const newDerived = derive(newPassword, newSalt);
  const { masterKey: newMaster, verifier: newVerifier } = splitMaster(newDerived);
  const { masterKey: oldMaster } = splitMaster(derive(oldPassword, oldRow.salt));

  // Update auth row (salt + verifier)
  db.prepare("UPDATE auth SET salt = ?, verifier = ? WHERE id = 1").run(
    newSalt,
    newVerifier,
  );

  let providersRekeyed = 0;
  let chatSessionsRekeyed = 0;
  let chatMessagesRekeyed = 0;
  let studyLogsRekeyed = 0;
  let filesRekeyed = 0;

  // --- ai_providers ---
  const providers = db.prepare(
    "SELECT id, api_key, key_nonce, key_tag FROM ai_providers",
  ).all() as Array<Record<string, unknown>>;
  for (const p of providers) {
    const enc = p.api_key as Buffer;
    const nonce = p.key_nonce as Buffer;
    const tag = p.key_tag as Buffer;
    if (!enc || !nonce || !tag) continue;
    const plain = gcmDecrypt(oldMaster, { enc, nonce, tag });
    const wrapped = gcmEncrypt(newMaster, plain);
    db.prepare(
      "UPDATE ai_providers SET api_key = ?, key_nonce = ?, key_tag = ? WHERE id = ?",
    ).run(wrapped.enc, wrapped.nonce, wrapped.tag, p.id);
    providersRekeyed++;
  }

  // --- chat_sessions (title + summary) ---
  const sessions = db.prepare(`
    SELECT id, title_enc, title_nonce, title_tag,
           summary_enc, summary_nonce, summary_tag
    FROM chat_sessions
  `).all() as Array<Record<string, unknown>>;
  for (const s of sessions) {
    if (s.title_enc && s.title_nonce && s.title_tag) {
      const plain = gcmDecrypt(oldMaster, {
        enc: s.title_enc as Buffer,
        nonce: s.title_nonce as Buffer,
        tag: s.title_tag as Buffer,
      });
      const wrapped = gcmEncrypt(newMaster, plain);
      db.prepare(
        "UPDATE chat_sessions SET title_enc=?, title_nonce=?, title_tag=? WHERE id=?",
      ).run(wrapped.enc, wrapped.nonce, wrapped.tag, s.id);
    }
    if (s.summary_enc && s.summary_nonce && s.summary_tag) {
      const plain = gcmDecrypt(oldMaster, {
        enc: s.summary_enc as Buffer,
        nonce: s.summary_nonce as Buffer,
        tag: s.summary_tag as Buffer,
      });
      const wrapped = gcmEncrypt(newMaster, plain);
      db.prepare(
        "UPDATE chat_sessions SET summary_enc=?, summary_nonce=?, summary_tag=? WHERE id=?",
      ).run(wrapped.enc, wrapped.nonce, wrapped.tag, s.id);
    }
    chatSessionsRekeyed++;
  }

  // --- chat_messages ---
  const messages = db.prepare(
    "SELECT id, content_enc, content_nonce, content_tag FROM chat_messages",
  ).all() as Array<Record<string, unknown>>;
  for (const m of messages) {
    if (!m.content_enc || !m.content_nonce || !m.content_tag) continue;
    const plain = gcmDecrypt(oldMaster, {
      enc: m.content_enc as Buffer,
      nonce: m.content_nonce as Buffer,
      tag: m.content_tag as Buffer,
    });
    const wrapped = gcmEncrypt(newMaster, plain);
    db.prepare(
      "UPDATE chat_messages SET content_enc=?, content_nonce=?, content_tag=? WHERE id=?",
    ).run(wrapped.enc, wrapped.nonce, wrapped.tag, m.id);
    chatMessagesRekeyed++;
  }

  // --- study_logs ---
  const logs = db.prepare(
    "SELECT id, notes_enc, notes_nonce, notes_tag FROM study_logs",
  ).all() as Array<Record<string, unknown>>;
  for (const l of logs) {
    if (!l.notes_enc || !l.notes_nonce || !l.notes_tag) continue;
    const plain = gcmDecrypt(oldMaster, {
      enc: l.notes_enc as Buffer,
      nonce: l.notes_nonce as Buffer,
      tag: l.notes_tag as Buffer,
    });
    const wrapped = gcmEncrypt(newMaster, plain);
    db.prepare(
      "UPDATE study_logs SET notes_enc=?, notes_nonce=?, notes_tag=? WHERE id=?",
    ).run(wrapped.enc, wrapped.nonce, wrapped.tag, l.id);
    studyLogsRekeyed++;
  }

  // --- files (DEK envelope only — content BLOBs are re-encrypted under the same DEK) ---
  const files = db.prepare(
    "SELECT id, dek, dek_nonce, dek_tag FROM files WHERE is_dir = 0 AND dek IS NOT NULL",
  ).all() as Array<Record<string, unknown>>;
  for (const f of files) {
    const enc = f.dek as Buffer;
    const nonce = f.dek_nonce as Buffer;
    const tag = f.dek_tag as Buffer;
    if (!enc || !nonce || !tag) continue;
    const dek = gcmDecrypt(oldMaster, { enc, nonce, tag });
    const wrapped = gcmEncrypt(newMaster, dek);
    db.prepare(
      "UPDATE files SET dek=?, dek_nonce=?, dek_tag=? WHERE id=?",
    ).run(wrapped.enc, wrapped.nonce, wrapped.tag, f.id);
    filesRekeyed++;
  }

  // Invalidate all sessions
  destroySession(null);

  return {
    providersRekeyed,
    chatSessionsRekeyed,
    chatMessagesRekeyed,
    studyLogsRekeyed,
    filesRekeyed,
  };
}
