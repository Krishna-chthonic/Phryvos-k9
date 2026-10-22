import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for vault data.
 * - Every encryption uses a fresh 12-byte random nonce.
 * - File content: per-file random DEK wrapped under the master key (GCM),
 *   content encrypted under the DEK.
 * - Direct blobs (chat content, API keys, titles): GCM under the master key.
 */

export interface GcmBlob {
  enc: Buffer;
  nonce: Buffer;
  tag: Buffer;
}

export function gcmEncrypt(key: Buffer, plain: Buffer, aad?: Buffer | string): GcmBlob {
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, nonce);
  if (aad) {
    c.setAAD(Buffer.isBuffer(aad) ? aad : Buffer.from(aad, "utf8"));
  }
  const enc = Buffer.concat([c.update(plain), c.final()]);
  return { enc, nonce, tag: c.getAuthTag() };
}

export function gcmDecrypt(key: Buffer, blob: GcmBlob, aad?: Buffer | string): Buffer {
  const d = createDecipheriv("aes-256-gcm", key, blob.nonce);
  d.setAuthTag(blob.tag);
  if (aad) {
    d.setAAD(Buffer.isBuffer(aad) ? aad : Buffer.from(aad, "utf8"));
  }
  return Buffer.concat([d.update(blob.enc), d.final()]);
}

export interface FileEnvelope {
  dek: Buffer;
  dekEnc: Buffer;
  dekNonce: Buffer;
  dekTag: Buffer;
}

/** Mint a new per-file DEK and wrap it under the vault master key, optionally bound to AAD. */
export function newFileEnvelope(masterKey: Buffer, aad?: Buffer | string): FileEnvelope {
  const dek = randomBytes(32);
  const wrapped = gcmEncrypt(masterKey, dek, aad);
  return { dek, dekEnc: wrapped.enc, dekNonce: wrapped.nonce, dekTag: wrapped.tag };
}

/** Open (unwrap) a per-file DEK under the master key, verifying AAD binding if provided. */
export function openFileEnvelope(
  masterKey: Buffer,
  wrapped: Pick<FileEnvelope, "dekEnc" | "dekNonce" | "dekTag">,
  aad?: Buffer | string,
): Buffer {
  try {
    return gcmDecrypt(
      masterKey,
      {
        enc: wrapped.dekEnc,
        nonce: wrapped.dekNonce,
        tag: wrapped.dekTag,
      },
      aad,
    );
  } catch (err) {
    if (aad) {
      // Backward compatibility: allow legacy envelopes created without AAD to decrypt
      return gcmDecrypt(masterKey, {
        enc: wrapped.dekEnc,
        nonce: wrapped.dekNonce,
        tag: wrapped.dekTag,
      });
    }
    throw err;
  }
}

/** Encrypt a string/Buffer directly under the master key (chat, keys, titles) with optional AAD. */
export function encryptBlob(masterKey: Buffer, plain: Buffer | string, aad?: Buffer | string): GcmBlob {
  return gcmEncrypt(
    masterKey,
    typeof plain === "string" ? Buffer.from(plain, "utf8") : plain,
    aad,
  );
}

export function decryptBlob(masterKey: Buffer, blob: GcmBlob, aad?: Buffer | string): string {
  return gcmDecrypt(masterKey, blob, aad).toString("utf8");
}
