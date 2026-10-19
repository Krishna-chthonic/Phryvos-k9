# Phryvos K9 — Dependency & Package Governance Specification

> **Phase 4 Deliverable**  
> **Status:** APPROVED & ACTIVE  
> **Target Environment:** Linux ARM64 (Android PRoot Ubuntu glibc & Standard POSIX Environments)

---

## 1. Governance Principles & Strict Constraints

1. **Zero Radix / CVA Re-introduction Policy**:
   - In accordance with Phase 6 UI Primitives modernization, `@radix-ui/*` and `class-variance-authority` are strictly banned from direct dependencies.
   - All interactive components use accessible, unbloated, pure React 19 primitives with zero external DOM wrappers.

2. **Native Runtime Boundary (PRoot ARM64 glibc)**:
   - All server-side native addons (`better-sqlite3`, etc.) MUST compile against glibc (`/usr/bin/node` v22).
   - Android Bionic Node (`/data/data/com.termux/files/usr/bin/node` v24) MUST NOT be executed against `node_modules` containing glibc `.node` binaries to prevent `ERR_DLOPEN_FAILED`.
   - The test script and dev binaries are permanently anchored to glibc PATH: `env PATH=/usr/bin:/bin:$PATH`.

3. **WASM & Pure JS Preference**:
   - Whenever an external library is considered, pure JS/TypeScript or portable WASM implementations are mandatory.
   - Heavy C++ bindings that lack prebuilt ARM64 glibc/musl binaries are rejected.

---

## 2. Direct Runtime Dependencies Inventory

| Package | Version | Purpose | License | Runtime / Architecture Notes |
| :--- | :--- | :--- | :--- | :--- |
| `@anthropic-ai/sdk` | `^0.133.0` | Claude API provider client | MIT | Pure JS HTTP client |
| `@hello-pangea/dnd` | `^18.0.1` | Drag & Drop for Kanban boards | Apache-2.0 | Pure React 19 compatible |
| `@monaco-editor/loader`| `^1.7.0` | Dynamic loader for Monaco editor | MIT | Client-side only |
| `@monaco-editor/react` | `^4.7.0` | React wrapper for code editor | MIT | Client-side only |
| `@tanstack/react-query`| `^5.104.1`| Client state caching & async queries| MIT | Universal JS |
| `@xyflow/react` | `^12.12.0` | Node graph visualization | MIT | Client-side SVG/Canvas |
| `adm-zip` | `^0.6.1` | ZIP compression & inspection | MIT | Pure JS Node.js buffer ops |
| `archiver` | `^8.0.0` | Streaming archive generator | MIT | Pure JS Node.js streams |
| `better-sqlite3` | `^13.0.3` | Local SQLite database engine | MIT | Native C++ addon (glibc compiled) |
| `date-fns` | `^4.4.0` | Modern date utility library | MIT | Tree-shakeable pure TS |
| `gantt-task-react` | `^0.3.9` | Gantt timeline scheduling chart | MIT | Client-side React |
| `katex` | `^0.19.0` | Fast mathematical typesetting | MIT | Pure JS / CSS math renderer |
| `lucide-react` | `^1.55.0` | Iconography suite | ISC | Tree-shakeable SVG components |
| `monaco-editor` | `^0.57.0` | Core code editor assets | MIT | Client-side JS web worker |
| `next` | `16.4.0` | Full-stack App Router framework | MIT | Universal (Turbopack/Webpack) |
| `node-cron` | `^4.6.0` | Background task scheduler | ISC | Pure JS background cron |
| `openai` | `^7.32.0` | OpenAI & compatible API client | Apache-2.0 | Pure JS HTTP client |
| `pdf-parse` | `^1.1.1` | PDF text extraction plugin | MIT | Pure JS stream parser |
| `react` / `react-dom`| `19.3.0` | Core UI library | MIT | Universal |
| `react-big-calendar` | `^1.20.0` | Schedule & calendar components | MIT | Client-side React |
| `react-markdown` | `^10.1.0` | Markdown AST renderer | MIT | Unified/Remark pipeline |
| `rehype-katex` | `^7.0.1` | HTML AST KaTeX processor | MIT | Unified AST plugin |
| `remark-gfm` | `^4.0.1` | GitHub Flavored Markdown support | MIT | Remark AST plugin |
| `remark-math` | `^6.0.0` | LaTeX math syntax parser | MIT | Remark AST plugin |
| `zod` | `^4.6.5` | Schema validation & tool typing | MIT | Zero-dependency pure TS |
| `zustand` | `^5.0.15` | Global reactive micro-state store| MIT | Universal lightweight store |

---

## 3. Development & Tooling Dependencies

| Package | Version | Purpose | Governance Rule |
| :--- | :--- | :--- | :--- |
| `tsx` | `^4.23.15` | Fast TS execution engine for tests | Explicitly declared; glibc anchored |
| `typescript` | `~5.9` | Static type checking (`tsc --noEmit`) | Strict mode mandatory |
| `drizzle-orm` / `kit`| `^0.45.4` / `^0.31.11` | SQLite schema migrations | Local zero-network migration |
| `tailwindcss` | `^3.4.13` | Utility styling engine | No unverified `@custom-variant` syntax |
| `playwright` | `^1.64.0` | End-to-end integration testing | Isolated headless browser runs |
| `@testing-library/*` | `^16.3.3` | Component test utilities | DOM testing in jsdom |

---

## 4. License Compliance Summary
- **100% Permissive Licenses**: Every single direct runtime dependency is under MIT, Apache-2.0, or ISC licenses.
- **Zero GPL / AGPL Contamination**: No copyleft licenses present in runtime dependencies.
- Completely safe for private, local-first zero-knowledge distribution.
