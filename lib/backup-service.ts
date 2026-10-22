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
 * User instruction verbatim: "Unified DAL enforcing lock verification before any query executes"
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import AdmZip from "adm-zip";
import { randomBytes, createHash } from "node:crypto";
import { derive, splitMaster, checkPassword } from "@/lib/crypto/kdf";
import { gcmEncrypt, gcmDecrypt } from "@/lib/crypto/envelope";
import { getDb } from "@/lib/db/client";
import { verifySchemaIntegrity } from "@/lib/db/migration-manager";
import { destroySession, destroyAllSessions } from "@/lib/session/store";
import { ensureVaultUnlocked, VaultLockedError } from "@/lib/dal/vault-dal";

// ------------------------------------------------------------ dirs

export const BACKUPS_DIR = path.join(process.cwd(), "backups");
export const EXPORT_DIR = path.join(process.cwd(), "exports");

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
 * Normalizes DB filename inside archive to "vault.db" for seamless restoration.
 */
export async function createExportBundle(kind: "auto" | "manual" | "export"): Promise<ExportResult> {
  await ensureVaultUnlocked();
  ensureBackupsDir();
  const db = getDb();
  const now = Date.now();
  const filename = stamp(kind);
  const targetDir = kind === "export" ? EXPORT_DIR : BACKUPS_DIR;
  const dest = path.join(targetDir, filename);
  const stagingDir = path.join(targetDir, `staging-${now}`);
  fs.mkdirSync(stagingDir, { recursive: true });

  const stagingDb = path.join(stagingDir, "vault.db");
  const manifestPath = path.join(stagingDir, "manifest.json");

  try {
    // VACUUM snapshot: await completion to prevent reading incomplete database
    await db.backup(stagingDb);

    const dbBuffer = fs.readFileSync(stagingDb);
    const dbSha256 = createHash("sha256").update(dbBuffer).digest("hex");

    // Manifest
    const manifest = JSON.stringify(
      {
        kind,
        created_at: now,
        version: "1.0",
        db_sha256: dbSha256,
        kdf_params: { name: "scrypt", N: 32768, r: 8, p: 1, len: 64 },
      },
      null,
      2,
    );
    fs.writeFileSync(manifestPath, manifest);

    const zip = new AdmZip();
    zip.addLocalFile(stagingDb, "", "vault.db");
    zip.addLocalFile(manifestPath, "", path.basename(manifestPath));
    zip.writeZip(dest);
  } finally {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {}
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

export async function listBackups(): Promise<BackupEntry[]> {
  await ensureVaultUnlocked();
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

export async function deleteBackup(id: number): Promise<void> {
  await ensureVaultUnlocked();
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
export async function restoreBackup(backupPath: string): Promise<RestoreResult> {
  await ensureVaultUnlocked();
  ensureBackupsDir();
  if (!fs.existsSync(backupPath)) throw new Error(`Backup not found: ${backupPath}`);

  const tmpDir = path.join(BACKUPS_DIR, `restore-tmp-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  let preRestoreBackup: string | null = null;
  let currentPath: string | null = null;

  try {
    const zip = new AdmZip(backupPath);
    const zipEntries = zip.getEntries();
    const normalizedTmp = path.resolve(tmpDir);
    for (const entry of zipEntries) {
      const entryTarget = path.resolve(tmpDir, entry.entryName);
      if (!entryTarget.startsWith(normalizedTmp + path.sep) && entryTarget !== normalizedTmp) {
        throw new Error(`Security Exception: Zip slip directory traversal detected in entry "${entry.entryName}"`);
      }
    }
    zip.extractAllTo(tmpDir, true);
    let restoredDbPath = path.join(tmpDir, "vault.db");
    if (!fs.existsSync(restoredDbPath)) {
      // Check for legacy/alternative DB filename (e.g. tmp-*.db)
      const candidate = fs.readdirSync(tmpDir).find((f) => f.endsWith(".db"));
      if (candidate) {
        restoredDbPath = path.join(tmpDir, candidate);
      } else {
        throw new Error("Backup does not contain vault.db or valid database snapshot");
      }
    }

    // Strict manifest verification: fail-closed if manifest exists
    const manifestFiles = fs.readdirSync(tmpDir).filter((f) => f.startsWith("manifest") && f.endsWith(".json"));
    if (manifestFiles.length > 0) {
      try {
        const manifestRaw = fs.readFileSync(path.join(tmpDir, manifestFiles[0]), "utf8");
        const manifest = JSON.parse(manifestRaw) as { db_sha256?: string };
        if (!manifest || typeof manifest !== "object" || typeof manifest.db_sha256 !== "string") {
          throw new Error("Backup corrupted: malformed manifest or missing db_sha256");
        }
        const actualSha256 = createHash("sha256")
          .update(fs.readFileSync(restoredDbPath))
          .digest("hex");
        if (actualSha256 !== manifest.db_sha256) {
          throw new Error("Backup corrupted: manifest checksum mismatch");
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          throw err;
        }
        throw new Error("Backup corrupted: manifest verification failed");
      }
    }

    // Verify integrity of candidate database before swapping
    const candidateDb = new Database(restoredDbPath, { readonly: true });
    try {
      const integrityOk = verifySchemaIntegrity(candidateDb);
      if (!integrityOk) {
        throw new Error("Backup corrupted: restored database failed SQLite integrity check");
      }
    } finally {
      candidateDb.close();
    }

    const currentDb = getDb();
    currentPath = currentDb.name;
    // Checkpoint & truncate WAL to ensure current DB snapshot is completely self-contained
    try {
      currentDb.pragma("wal_checkpoint(TRUNCATE)");
    } catch {}
    currentDb.close();

    // Preserve pre-restore safety snapshot for rollback
    preRestoreBackup = `${currentPath}.pre-restore-${Date.now()}.bak`;
    fs.copyFileSync(currentPath, preRestoreBackup);

    // Remove old WAL/SHM artifacts before copying new database
    try { fs.unlinkSync(`${currentPath}-wal`); } catch {}
    try { fs.unlinkSync(`${currentPath}-shm`); } catch {}

    try {
      fs.copyFileSync(restoredDbPath, currentPath);
      const newDb = new Database(currentPath);
      newDb.pragma("journal_mode = WAL");
      newDb.pragma("busy_timeout = 5000");
      newDb.pragma("foreign_keys = ON");

      // Update globalThis singleton
      const g = globalThis as unknown as {
        __phryvosDb?: Database.Database;
        __phryvosDbPath?: string;
      };
      g.__phryvosDb = newDb;
      g.__phryvosDbPath = currentPath;

      const count = newDb.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number };
      destroyAllSessions();

      // Clean up safety snapshot on success
      if (preRestoreBackup && fs.existsSync(preRestoreBackup)) {
        fs.unlinkSync(preRestoreBackup);
      }

      return { ok: true, filesCount: count.n };
    } catch (swapErr) {
      // Rollback to original database on error
      if (preRestoreBackup && currentPath && fs.existsSync(preRestoreBackup)) {
        try { fs.unlinkSync(`${currentPath}-wal`); } catch {}
        try { fs.unlinkSync(`${currentPath}-shm`); } catch {}
        fs.copyFileSync(preRestoreBackup, currentPath);
        const rollbackDb = new Database(currentPath);
        rollbackDb.pragma("journal_mode = WAL");
        rollbackDb.pragma("foreign_keys = ON");
        const g = globalThis as unknown as {
          __phryvosDb?: Database.Database;
          __phryvosDbPath?: string;
        };
        g.__phryvosDb = rollbackDb;
        g.__phryvosDbPath = currentPath;
        fs.unlinkSync(preRestoreBackup);
      }
      throw swapErr;
    }
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
  fileVersionsRekeyed: number;
}

/**
 * Change the vault password with atomic all-or-nothing transaction guarantees.
 *
 * Procedure:
 *  1. Verify old password against stored verifier.
 *  2. Derive new master key from new password using scrypt.
 *  3. In a single SQLite transaction, re-encrypt all GCM-wrapped columns:
 *     - ai_providers, chat_sessions, chat_messages, study_logs
 *     - files (active DEKs)
 *     - file_versions (historical version DEKs)
 *  4. Update auth salt + verifier in the SAME transaction.
 *     If any single record fails to decrypt, the transaction aborts and rolls back completely.
 *  5. Invalidate all active sessions.
 */
export async function rekeyVault(oldPassword: string, newPassword: string): Promise<ReKeyResult> {
  await ensureVaultUnlocked();
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

  let providersRekeyed = 0;
  let chatSessionsRekeyed = 0;
  let chatMessagesRekeyed = 0;
  let studyLogsRekeyed = 0;
  let filesRekeyed = 0;
  let fileVersionsRekeyed = 0;

  // Execute all record re-encryptions and auth commit in an atomic transaction
  const executeRekeyTransaction = db.transaction(() => {
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

    // --- files (DEK envelope only — content BLOBs remain intact) ---
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

    // --- file_versions (historical version DEKs) ---
    const versions = db.prepare(
      "SELECT fv.id, fv.dek, fv.dek_nonce, fv.dek_tag FROM file_versions fv INNER JOIN files f ON fv.file_id = f.id WHERE f.is_dir = 0 AND fv.dek IS NOT NULL",
    ).all() as Array<Record<string, unknown>>;
    for (const v of versions) {
      const enc = v.dek as Buffer;
      const nonce = v.dek_nonce as Buffer;
      const tag = v.dek_tag as Buffer;
      if (!enc || !nonce || !tag) continue;
      const dek = gcmDecrypt(oldMaster, { enc, nonce, tag });
      const wrapped = gcmEncrypt(newMaster, dek);
      db.prepare(
        "UPDATE file_versions SET dek=?, dek_nonce=?, dek_tag=? WHERE id=?",
      ).run(wrapped.enc, wrapped.nonce, wrapped.tag, v.id);
      fileVersionsRekeyed++;
    }

    // Commit new auth salt and verifier only after all records successfully decrypt & re-encrypt
    db.prepare("UPDATE auth SET salt = ?, verifier = ? WHERE id = 1").run(
      newSalt,
      newVerifier,
    );
  });

  executeRekeyTransaction();

  // Invalidate all active sessions across RAM and cookies
  destroyAllSessions();

  return {
    providersRekeyed,
    chatSessionsRekeyed,
    chatMessagesRekeyed,
    studyLogsRekeyed,
    filesRekeyed,
    fileVersionsRekeyed,
  };
}
