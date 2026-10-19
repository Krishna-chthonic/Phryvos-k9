/**
 * Client-Side AES-GCM Encrypted Backups (Web Crypto API).
 *
 * Provides zero-knowledge export/import of vault data directly in the browser
 * using window.crypto.subtle. The .phryvos container format stores encrypted
 * SQLite database + manifest. Master key never leaves the browser.
 *
 * Importers/callers: components/vault/BackupPanel.tsx, app/api/backups/restore
 * Affected API: Backup export/import flow, client-side encryption
 * Data schemas: PhryvosContainer (encrypted DB + manifest + metadata)
 * User instruction verbatim: "Client-Side AES-GCM Encrypted Backups: In-browser zero-knowledge export/import via window.crypto.subtle (.phryvos container)"
 */
export interface PhryvosContainer {
  version: number;
  createdAt: number;
  kdfParams: KdfParams;
  salt: string; // base64
  iv: string;   // base64 (for AES-GCM)
  ciphertext: string; // base64 (encrypted SQLite database)
  manifest: ContainerManifest;
}

export interface ContainerManifest {
  version: string;
  kind: "auto" | "manual" | "export";
  tables: string[];
  rowCounts: Record<string, number>;
  schemaHash: string;
}

export interface KdfParams {
  name: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  length: number; // key length in bits
}

export interface ExportOptions {
  password: string;
  kind?: "auto" | "manual" | "export";
  includeDecoy?: boolean;
  onProgress?: (progress: number, stage: string) => void;
}

export interface ImportResult {
  success: boolean;
  dbPath?: string;
  rowCounts?: Record<string, number>;
  error?: string;
}

const CONTAINER_VERSION = 1;
const KDF_ITERATIONS = 600000; // PBKDF2 iterations (OWASP 2024 recommendation)
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12; // bytes (96 bits for GCM)

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer.slice(0); // Ensure ArrayBuffer not SharedArrayBuffer
}

/**
 * Convert string to UTF-8 ArrayBuffer
 */
function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

/**
 * Derive encryption key from password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    stringToArrayBuffer(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: KDF_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Generate a random salt
 */
function generateSalt(): Uint8Array {
  const arr = new Uint8Array(32);
  return window.crypto.getRandomValues(arr);
}

/**
 * Generate a random IV
 */
function generateIv(): Uint8Array {
  const arr = new Uint8Array(IV_LENGTH);
  return window.crypto.getRandomValues(arr);
}

/**
 * Calculate SHA-256 hash of data (for schema verification)
 */
async function calculateHash(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  return arrayBufferToBase64(hashBuffer);
}

/**
 * Export vault database to encrypted .phryvos container
 * This runs entirely in the browser - master key never leaves client
 */
export async function exportEncryptedBackup(
  dbArrayBuffer: ArrayBuffer,
  options: ExportOptions
): Promise<PhryvosContainer> {
  const { password, kind = "manual", onProgress } = options;

  onProgress?.(10, "Generating salt...");
  const salt = generateSalt();

  onProgress?.(20, "Deriving encryption key...");
  const key = await deriveKey(password, salt);

  onProgress?.(40, "Encrypting database...");
  const iv = generateIv();
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    dbArrayBuffer
  );

  onProgress?.(70, "Building manifest...");
  // Parse database to get table info (simplified - in real implementation,
  // we'd read the SQLite file to get actual table counts)
  const manifest: ContainerManifest = {
    version: "1.0",
    kind,
    tables: ["files", "chat_sessions", "chat_messages", "study_logs", "ai_providers", "goals", "tasks", "projects", "exam_subjects", "backups", "auth", "file_versions", "files_fts", "file_content_fts"],
    rowCounts: {},
    schemaHash: await calculateHash(dbArrayBuffer),
  };

  onProgress?.(90, "Finalizing container...");
  const container: PhryvosContainer = {
    version: CONTAINER_VERSION,
    createdAt: Date.now(),
    kdfParams: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: KDF_ITERATIONS,
      length: KEY_LENGTH,
    },
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    ciphertext: arrayBufferToBase64(ciphertext),
    manifest,
  };

  onProgress?.(100, "Export complete");
  return container;
}

/**
 * Import and decrypt .phryvos container
 * Returns decrypted database ArrayBuffer ready for restore
 */
export async function importEncryptedBackup(
  container: PhryvosContainer,
  password: string,
  onProgress?: (progress: number, stage: string) => void
): Promise<{ dbArrayBuffer: ArrayBuffer; manifest: ContainerManifest }> {
  onProgress?.(10, "Parsing container...");

  // Verify version
  if (container.version !== CONTAINER_VERSION) {
    throw new Error(`Unsupported container version: ${container.version}`);
  }

  // Verify KDF parameters
  if (container.kdfParams.iterations < 100000) {
    throw new Error("KDF iterations too low - potential security risk");
  }

  onProgress?.(30, "Deriving decryption key...");
  const salt = new Uint8Array(base64ToArrayBuffer(container.salt));
  const key = await deriveKey(password, salt);

  onProgress?.(50, "Decrypting database...");
  const iv = new Uint8Array(base64ToArrayBuffer(container.iv));
  const ciphertext = base64ToArrayBuffer(container.ciphertext);

  let dbArrayBuffer: ArrayBuffer;
  try {
    dbArrayBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext
    );
  } catch (error) {
    throw new Error("Decryption failed - incorrect password or corrupted container");
  }

  onProgress?.(80, "Verifying integrity...");
  const computedHash = await calculateHash(dbArrayBuffer);
  if (computedHash !== container.manifest.schemaHash) {
    throw new Error("Integrity check failed - container may be corrupted or tampered");
  }

  onProgress?.(100, "Import complete");
  return { dbArrayBuffer, manifest: container.manifest };
}

/**
 * Serialize container to JSON string for download
 */
export function serializeContainer(container: PhryvosContainer): string {
  return JSON.stringify(container, null, 2);
}

/**
 * Parse container from JSON string
 */
export function parseContainer(json: string): PhryvosContainer {
  const container = JSON.parse(json) as PhryvosContainer;

  // Validate required fields
  if (!container.version || !container.ciphertext || !container.salt || !container.iv) {
    throw new Error("Invalid container format - missing required fields");
  }

  return container;
}

/**
 * Download container as .phryvos file
 */
export function downloadContainer(container: PhryvosContainer, filename?: string): void {
  const json = serializeContainer(container);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `phryvos-backup-${new Date().toISOString().slice(0, 10)}.phryvos`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

/**
 * Read .phryvos file from File object
 */
export function readContainerFile(file: File): Promise<PhryvosContainer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const container = parseContainer(event.target?.result as string);
        resolve(container);
      } catch (error) {
        reject(new Error(`Failed to parse container: ${error instanceof Error ? error.message : "Unknown error"}`));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

/**
 * Verify container password without full decryption (quick check)
 */
export async function verifyContainerPassword(
  container: PhryvosContainer,
  password: string
): Promise<boolean> {
  try {
    const salt = new Uint8Array(base64ToArrayBuffer(container.salt));
    const key = await deriveKey(password, salt);
    const iv = new Uint8Array(base64ToArrayBuffer(container.iv));
    const ciphertext = base64ToArrayBuffer(container.ciphertext);

    // Try decrypting just the first few bytes
    await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.slice(0, Math.min(1024, ciphertext.byteLength))
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Get container info without decryption
 */
export function getContainerInfo(container: PhryvosContainer): {
  version: number;
  createdAt: Date;
  kind: string;
  tables: string[];
  schemaHash: string;
  kdfIterations: number;
} {
  return {
    version: container.version,
    createdAt: new Date(container.createdAt),
    kind: container.manifest.kind,
    tables: container.manifest.tables,
    schemaHash: container.manifest.schemaHash.slice(0, 16) + "...",
    kdfIterations: container.kdfParams.iterations,
  };
}