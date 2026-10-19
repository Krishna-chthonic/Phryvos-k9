# ADR 0009: Portable Vault Export/Import Format (Encrypted Zip)

## Context & Problem Statement
Users require effortless backup and restoration across devices (e.g. mobile Termux to desktop PC) without proprietary vendor lock-in or unencrypted plaintext exposure during transfer.

## Decision
We specify a portable `.phryvos` archive standard:
1. Standard ZIP container compressed with `adm-zip` / `archiver`.
2. Header manifest `vault-manifest.json` containing schema version, KDF salt, and content checksums (SHA-256).
3. Payload files and SQLite dump are AES-256-GCM encrypted using the vault master key derived from the user's password.
4. Import validates manifest signature, tests key against verifier, and restores relations atomically inside a SQLite transaction.

## Consequences
- Single-file drag-and-drop backup.
- Safe transfer over untrusted channels (cloud drives, messaging apps).
