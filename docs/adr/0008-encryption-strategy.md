# ADR 0008: Zero-Knowledge Envelope Encryption & Argon2id/PBKDF2 KDF

## Context & Problem Statement
The vault stores private thoughts, study notes, API keys, and sensitive documents. If a device is compromised, unencrypted SQLite files would expose everything.

## Decision
We implement a zero-knowledge cryptographic envelope architecture:
1. **Key Derivation Function (KDF)**: Derives a 64-byte secret from user passphrase + 32-byte CSPRNG salt using hardened KDF parameters. Split into:
   - 32-byte Master Key ($K_{master}$) for authenticated envelope encryption.
   - 32-byte Verifier Key ($K_{verifier}$) for zero-knowledge auth verification without storing the password.
2. **Authenticated Cipher**: AES-256-GCM with fresh 96-bit random nonce per write and 128-bit authentication tag.
3. **Envelope Pattern**: Each file in the vault receives its own ephemeral Data Encryption Key (DEK), wrapped under the user's master key.

## Consequences
- At-rest data is cryptographically unreadable without the passphrase.
- File-level compromise does not compromise adjacent files.
