# ADR 0003: AI Agent Runtime Boundaries & Sandboxing

## Context & Problem Statement
The autonomous AI agent possesses capabilities to execute tools, fetch web resources, run JavaScript snippets, and access the user's encrypted vault. Unbounded execution risks SSRF, prompt injection, and host compromise.

## Decision
We enforce strict multi-tier sandboxing around the agent runtime:
1. **SSRF Guard**: `lib/agent/web-fetch.ts` validates hostnames and IPs against private/loopback/cloud-metadata ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254`). All redirects are inspected.
2. **Code Execution Sandbox**: Sandboxed JavaScript execution is constrained without access to Node `fs`, `child_process`, or network sockets.
3. **Data Boundary**: Untrusted retrieved RAG chunks are delimited with explicit instruction bounds to prevent indirect prompt injection.

## Consequences
- Protects local network devices, Termux services, and private files from malicious web scrapes or rogue agent loops.
