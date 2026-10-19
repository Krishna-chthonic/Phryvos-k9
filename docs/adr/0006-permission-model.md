# ADR 0006: User-in-the-Loop Permission & Destructive Action Gate

## Context & Problem Statement
Autonomous execution of actions such as file overwrites, project deletion, or sensitive data exports can cause irreversible data loss if invoked erroneously by an LLM hallucination.

## Decision
We enforce an explicit approval workflow for destructive tools:
1. `requiresApproval: true` tools trigger a pending action state in the execution loop.
2. The agent loop pauses and persists the approval request to the client.
3. Execution proceeds only after an explicit user confirmation payload (`allow: true`).
4. Rejection returns a polite rejection feedback message to the LLM context, allowing it to adapt its plan.

## Consequences
- Guaranteed protection against unintended data loss while maintaining full agent autonomy for read and compute tasks.
