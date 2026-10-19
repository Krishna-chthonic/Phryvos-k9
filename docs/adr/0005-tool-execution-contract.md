# ADR 0005: Tool Execution Contract & Zod Validation Gateways

## Context & Problem Statement
AI agents generate malformed tool parameters or attempt unexpected calls. Crashes during tool parameter parsing degrade user trust and interrupt workflows.

## Decision
All agent tools must implement the `AgentTool<T>` contract:
1. Strong schema validation using `zod`.
2. Safe execution boundary: validation errors are caught and returned as structured error strings back to the LLM context rather than throwing runtime exceptions.
3. Declarative approval classification: tools declare whether they are readonly or require user approval before execution (`requiresApproval: boolean`).

## Consequences
- The LLM can self-correct parameter errors within the loop.
- Unhandled tool crashes are eliminated.
