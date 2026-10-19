# ADR 0007: Background Daemon Tasks & Spaced Repetition Engine

## Context & Problem Statement
Phryvos K9 manages active study schedules (JEE preparation), spaced repetition flashcards (FSRS), and periodic database maintenance (vacuuming, compaction). These tasks must run predictably without draining mobile battery or blocking UI thread rendering.

## Decision
We implement a lightweight background daemon coordinator:
1. `node-cron` schedules scheduled jobs when the process is active.
2. In-memory queue with persistent status recorded in SQLite.
3. Spaced repetition engine follows modern FSRS (Free Spaced Repetition Scheduler) algorithms computing memory stability ($S$) and difficulty ($D$) locally.
4. Daemons yield control cooperatively to avoid saturating single-threaded ARM cores.

## Consequences
- Reliable autonomous reviews and proactive study synthesis without external cloud webhooks.
