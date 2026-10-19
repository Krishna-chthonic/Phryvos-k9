# ADR 0001: Storage Architecture — SQLite WAL with Envelope Encryption

## Context & Problem Statement
Phryvos K9 operates as a local-first, zero-knowledge personal operating system running on ARM64 Linux (including Android PRoot environments) and desktop browsers. It requires ACID compliance, zero cloud database dependencies, low-latency relational queries, and end-to-end cryptographic privacy.

## Decision
We adopt **SQLite 3 in WAL mode** (`better-sqlite3`) as the single source of truth for structured vault data, coupled with AES-256-GCM envelope encryption for sensitive payload fields.

### Key Details
- **Journal Mode**: `PRAGMA journal_mode = WAL;` with synchronous = NORMAL.
- **Foreign Keys**: `PRAGMA foreign_keys = ON;` strictly enforced.
- **Schema Management**: Drizzle ORM schema with declarative SQL migrations run at startup (`lib/db/migrate.ts`).
- **Encrypted Columns**: User files, message bodies, provider API keys, and memory entries are stored as AES-256-GCM ciphertexts with 96-bit random nonces and 128-bit authentication tags.

## Alternatives Considered
1. **IndexedDB Only**: Inadequate for server-side Next.js route handlers and agent tools; lacks ACID multi-table joins.
2. **PostgreSQL / Docker**: Excessive RAM and battery overhead on mobile/PRoot ARM64 hardware; violates self-contained single-binary goals.

## Consequences
- **Positive**: Blazing fast sub-millisecond local reads; crash-resilient; zero cloud leakage; single-file backup (`vault.db`).
- **Negative**: Native addon compilation requires glibc toolchain on ARM64.
