# ADR 0010: Testing Strategy & ARM64 glibc Runtime Enforcement

## Context & Problem Statement
Phryvos K9 runs across diverse environments, from Android PRoot Ubuntu chroots to x86_64 CI servers. Native Node modules (`better-sqlite3`) will crash with `ERR_DLOPEN_FAILED` if executed by Android bionic Node instead of the container's glibc Node.

## Decision
We mandate a multi-layered verification strategy:
1. **GLIBC PATH Anchor**: `package.json` test runner scripts explicitly set `env PATH=/usr/bin:/bin:$PATH tsx --test`.
2. **Fast Unit & Service Baselines**: Built with Node.js native test runner (`node:test` + `node:assert/strict`) for instant execution without Jest/Vitest overhead.
3. **In-Memory & Isolated DB Fixtures**: Each test suite initializes its own transient SQLite database (`fs.mkdtempSync`), executes full migrations, and cleans up on exit.
4. **End-to-End Tests**: Playwright integration runs against production builds for critical interactive user journeys.

## Consequences
- 100% deterministic test execution on mobile Termux PRoot and desktop machines.
- Instant regression detection before any git commit or release packaging.
