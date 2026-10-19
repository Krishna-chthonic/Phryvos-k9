# ADR 0002: Unified AI Provider Interface & Key Isolation

## Context & Problem Statement
Users connect multiple AI providers (OpenAI, Anthropic, Ollama, LM Studio, Groq, OpenRouter). Provider credentials must never be leaked to the frontend, logged to disk, or exposed across session boundaries.

## Decision
We establish a uniform `LlmClient` interface with provider-agnostic streaming and tool-calling contracts. Provider API keys are decrypted in-memory only during the invocation of the adapter (`lib/providers-service.ts` -> `connectionFor`).

### Key Details
- Credentials stored as encrypted blobs in `ai_providers` table.
- Adapter factory instantiates either Anthropic SDK adapter or OpenAI-compatible client.
- Frontend only receives `ProviderMeta` containing provider metadata, model list, and a boolean `hasKey`. Plaintext keys never touch the client.

## Consequences
- Single abstraction allows hot-swapping models without restarting the application or losing session context.
- High security barrier against XSS and accidental credential leakage.
