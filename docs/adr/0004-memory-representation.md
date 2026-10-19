# ADR 0004: Hierarchical Memory Architecture & Semantic Retrieval

## Context & Problem Statement
Large chat histories exceed context limits. Ephemeral chat sessions forget user preferences, study progress, and long-term goals.

## Decision
We implement a three-tiered memory hierarchy:
1. **Working Memory**: Active session messages windowed with token budgeting.
2. **Episodic Summary Memory**: Session compaction condenses older turns into encrypted narrative summaries stored in `chat_sessions.summary`.
3. **Semantic Long-Term Memory**: Key facts, preferences, exam targets, and user traits stored in `permanent_memories` table, automatically injected into system context during `buildContext()`.

## Consequences
- Preserves context across multi-week interactions while keeping token consumption bounded and costs low.
- Zero data leaves the local vault for external vector cloud databases.
