import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkPassword,
  derive,
  KDF_ID,
  newSalt,
  splitMaster,
} from "../lib/crypto/kdf.ts";
import {
  decryptBlob,
  encryptBlob,
  gcmDecrypt,
  gcmEncrypt,
  newFileEnvelope,
  openFileEnvelope,
} from "../lib/crypto/envelope.ts";

describe("KDF", () => {
  it("KDF_ID is versioned", () => {
    assert.match(KDF_ID, /scrypt/);
  });

  it("derives a 64-byte key split into master + verifier", () => {
    const salt = newSalt();
    assert.equal(salt.length, 16);
    const derived = derive("hunter2-pass", salt);
    assert.equal(derived.length, 64);
    const { masterKey, verifier } = splitMaster(derived);
    assert.equal(masterKey.length, 32);
    assert.equal(verifier.length, 32);
  });

  it("is deterministic for a fixed salt, differs across salts", () => {
    const salt = newSalt();
    const a = derive("pw", salt);
    const b = derive("pw", salt);
    const c = derive("pw", newSalt());
    assert.ok(a.equals(b));
    assert.ok(!a.equals(c));
  });

  it("checkPassword verifies correct, rejects wrong", () => {
    const salt = newSalt();
    const { verifier } = splitMaster(derive("correct-password", salt));
    assert.ok(checkPassword("correct-password", salt, verifier));
    assert.ok(!checkPassword("wrong", salt, verifier));
  });
});

describe("GCM envelope", () => {
  const key = () => Buffer.alloc(32, 7);

  it("round-trips a blob", () => {
    const plain = Buffer.from("hello vault", "utf8");
    const blob = gcmEncrypt(key(), plain);
    assert.ok(!blob.enc.equals(plain));
    assert.ok(gcmDecrypt(key(), blob).equals(plain));
  });

  it("rejects tampered ciphertext", () => {
    const blob = gcmEncrypt(key(), Buffer.from("x"));
    blob.enc = Buffer.concat([blob.enc, Buffer.alloc(1)]);
    assert.throws(() => gcmDecrypt(key(), blob));
  });

  it("encryptBlob/decryptBlob round-trip under master key", () => {
    const k = key();
    const blob = encryptBlob(k, "secret text 📁");
    assert.equal(decryptBlob(k, blob), "secret text 📁");
  });

  it("per-file DEK envelope: wrap + open", () => {
    const master = key();
    const content = Buffer.from("file bytes", "utf8");

    const env = newFileEnvelope(master);
    const dek = openFileEnvelope(master, env);
    assert.ok(dek.equals(env.dek));

    // content encrypted under the DEK
    const enc = gcmEncrypt(dek, content);
    assert.ok(gcmDecrypt(dek, enc).equals(content));

    // a different master key cannot open the DEK
    const other = Buffer.alloc(32, 9);
    assert.throws(() => openFileEnvelope(other, env));
  });

  it("fresh nonce per encryption", () => {
    const k = key();
    const a = encryptBlob(k, "same");
    const b = encryptBlob(k, "same");
    assert.ok(!a.nonce.equals(b.nonce));
  });
});
