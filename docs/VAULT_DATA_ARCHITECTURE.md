# Phryvos K9 — Vault Data Architecture & Storage Audit

> **Phase 11 Deliverable**  
> **Status:** APPROVED & AUDITED  
> **Cryptographic Boundary:** AES-256-GCM Zero-Knowledge Envelope  

---

## 1. Data Classification & Physical Storage Locations

| Data Category | Classification | Physical Location | Encryption Status | Retention & Deletion Policy |
| :--- | :--- | :--- | :--- | :--- |
| **User Vault Files** | User-Owned | SQLite `files` table | AES-256-GCM via per-file DEK wrapped under Master Key | Permanent until user delete (soft delete supported with `deleted_at`, hard purge via API) |
| **File Versions** | User-Owned | SQLite `file_versions` table | AES-256-GCM via DEK | Pruned when file is purged |
| **Search Indexes** | Derivative | SQLite `files_fts`, `file_content_fts` | Plaintext SQLite index (local device only) | Synchronized on file write; purged on file delete |
| **Vector Chunks** | Derivative | SQLite `file_chunks` | Plaintext chunk tokens (local device only) | Re-indexed on file modification; purged on file delete |
| **Chat Sessions** | User-Owned | SQLite `chat_sessions` | Title & metadata plaintext, session summaries encrypted | User deletion cascades to all messages |
| **Chat Messages** | User-Owned | SQLite `chat_messages` | Plaintext inside SQLite WAL (protected by device/OS sandbox) | Cascade delete with session; individual message deletion supported |
| **Permanent Memories** | Agent/User Shared | SQLite `memories` table | Plaintext point + category | User can view, edit, and delete; agent cannot re-create deleted memories |
| **Short-Term Memory** | Phryvos Runtime | SQLite `short_term_memories` | Ephemeral observations | Auto-purged or consolidated into permanent memory via daemon |
| **AI Providers & Keys** | Security / Auth | SQLite `ai_providers` | AES-256-GCM encrypted under Master Key | Plaintext key never written to disk or sent to browser |
| **Auth Verifier & Salt** | Security / Auth | SQLite `auth` table | 32-byte Argon2id/PBKDF2 verifier hash + CSPRNG salt | Zero-knowledge; password never stored |
| **Active Sessions** | Ephemeral | SQLite `sessions` table | 32-byte CSPRNG token | Reaped on expiry (sliding 24h window) |
| **Projects & Tasks** | User-Owned | SQLite `projects`, `tasks`, `task_deps` | Structured relational tables | Foreign key cascade delete on project removal |
| **Goals & Milestones** | User-Owned | SQLite `goals`, `goal_milestones` | Relational SQLite tables | Auto-progress recomputed on milestone change |
| **Exams & Study Logs** | User-Owned | SQLite `exam_subjects`, `exam_topics`, `exam_logs` | Relational SQLite tables | Permanent study progress tracking |
| **Spaced Repetition** | Agent / Study | SQLite `fsrs_cards` | Relational FSRS parameters ($S, D, R$) | Updated during study sessions |
| **Background Jobs** | Phryvos Runtime | SQLite `background_jobs` | Lifecycle status & payload | Auto-reaped after completion/failure |

---

## 2. Invariants & Zero-Knowledge Envelopes
1. **At-Rest Protection**: An attacker stealing `vault.db` cannot decrypt user files or provider API keys without the user's master passphrase.
2. **Crash Resilience**: `PRAGMA journal_mode = WAL;` with synchronous = NORMAL ensures ACID transactions survive ungraceful Termux / OS process kills.
3. **No Cloud Leakage**: No telemetry, embeddings, or decrypted vault blobs are transmitted to external sync servers without explicit user-initiated backup export.
