import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Vault key derivation.
 * scrypt(password, salt) → 64 bytes: [ masterKey(32) | verifier(32) ].
 * KDF parameters are versioned in the DB (auth.kdf) so they can be upgraded
 * cleanly in the future.
 */
export const KDF_ID = "scrypt-N32768-r8-p1-len64";

const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function newSalt(): Buffer {
  return randomBytes(16);
}

export function derive(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 64, SCRYPT);
}

export function splitMaster(
  derived: Buffer,
): { masterKey: Buffer; verifier: Buffer } {
  return {
    masterKey: derived.subarray(0, 32),
    verifier: derived.subarray(32, 64),
  };
}

export function checkPassword(
  password: string,
  salt: Buffer,
  storedVerifier: Buffer,
): boolean {
  if (storedVerifier.length !== 32) return false;
  const { verifier } = splitMaster(derive(password, salt));
  return timingSafeEqual(verifier, storedVerifier);
}
