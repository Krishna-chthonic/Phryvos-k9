<div align="center">

```
   ____  __                               
  / __ \/ /_  ______  ______  ______  _____
 / /_/ / __ \/ ___/ / / / / / / __ \/ ___/
/ ____/ / / / /  / /_/ / /_/ / /_/ (__  ) 
/_/   /_/ /_/_/   \__, /\__,_/\____/____/  
                 /____/                    
```

# Phryvos (K9)
### 🔒 Local-First, Envelope-Encrypted AI Vault & Personal Life OS

[![Next.js](https://img.shields.io/badge/Next.js-16.4-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?style=for-the-badge&logo=sqlite)](https://sqlite.org/)
[![Security](https://img.shields.io/badge/Encryption-AES--256--GCM-green?style=for-the-badge&logo=shield)](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
[![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)](LICENSE)

<p align="center">
  <b>Phryvos</b> is an open-source, private-by-design personal vault that combines a conversational AI assistant with complete life tracking and file management. 
  <br />
  <b>Zero cloud tracking. Zero developer relays. 100% of your data stays locally on your device.</b>
</p>

---

</div>

## ✨ Key Features

| Module | Highlights |
| :--- | :--- |
| **🤖 AI Assistant** | Multi-session chat, streaming responses, `@file` vault context injections, vision support, sandboxed HTML artifact previews, tool execution with approval gates. |
| **📁 File Manager** | Encrypted file tree with full-text search (FTS5), Monaco code editor, automatic version history (20 snapshots + daily), binary file previews. |
| **🔌 Custom AI Providers** | Bring your own keys and models! Works with any OpenAI-compatible endpoint (Ollama, OpenRouter, LocalAI) plus Anthropic presets. Keys are stored encrypted with your master key. |
| **📋 Project Tracking** | Interactive Kanban boards, Gantt charts, dependency graphs (prerequisite blockers), and live task time tracking. |
| **🎯 Life OS Modules** | Goal tracking with milestones, Exam study planners with progress sliders & time logs, and standalone local calendar. |
| **🛡️ Local-First Vault Security** | Scrypt KDF + AES-256-GCM envelope encryption for stored files, versions, and AI provider API keys. Salted duress PIN with isolated Ghost Vault (decoy NCERT database) defense. |
| **📦 Backup & Restore** | Encrypted full bundles (DB + blobs + manifest), automated scheduled snapshots, single-click restore, and password re-keying. |

---

## 🔒 Data Privacy & AI Provider Boundaries

- **100% Local Vault Storage:** Your files, notes, database records (`data/vault.db`), version histories, and settings stay strictly on your local disk.
- **Zero Telemetry:** Phryvos contains no background analytics, cloud tracking, or developer telemetry pings.
- **AI Processing Boundary:**
  - **Local Models (Ollama, LocalAI):** All inference, prompts, and `@file` context stay completely within your local machine with zero external data egress.
  - **Remote Cloud Models (OpenAI, Anthropic, OpenRouter):** When you configure remote API keys, messages and explicitly referenced file excerpts are sent via HTTPS directly from your machine to that provider's API. No intermediate developer relays exist.

---

## ⚡ Quick Start

### 1. One-Line Install (Recommended)

Run this command in your terminal (Linux, macOS, or Android Termux):

```bash
curl -fsSL https://raw.githubusercontent.com/Krishna-chthonic/Phryvos-k9/main/install.sh | bash
```

### 2. Manual Clone & Run

```bash
# Clone the repository
git clone https://github.com/Krishna-chthonic/Phryvos-k9.git phryvos
cd phryvos

# Install dependencies & build
npm install
npm run build

# Start using the CLI
./bin/phryvos.mjs start
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser!

---

## 💻 CLI Reference (`phryvos-k9`)

Phryvos K9 includes a built-in terminal CLI to manage your background daemon effortlessly:

```bash
phryvos-k9 <command> [options]
# (also supports: phryvos k9 <command>)
```

| Command | Description |
| :--- | :--- |
| `phryvos-k9 start` | Start Phryvos K9 server as a background daemon (default port `3000`) |
| `phryvos-k9 start --dev` | Start in development mode with live hot-reloading |
| `phryvos-k9 start -f` | Run in the foreground of the current terminal |
| `phryvos-k9 stop` | Stop the running Phryvos K9 background server |
| `phryvos-k9 restart` | Restart the background server |
| `phryvos-k9 status` | Check if Phryvos K9 is currently running and responding |
| `phryvos-k9 logs` | View the latest server logs (`tail -n 50`) |
| `phryvos-k9 update` | Fetch latest release from Git and automatically rebuild |
| `phryvos-k9 version` | Display installed version |

---

## 🔐 Security & Encryption Architecture

```
User Password ─scrypt(N=32768, r=8, p=1, len=64)→ 64 bytes
                     ├─ 0–31  = MASTER KEY (held in RAM only, dropped on lock)
                     └─ 32–63 = Verifier (checked via timingSafeEqual)

Per-File DEK = randomBytes(32) → AES-256-GCM(MASTER, DEK); AES-256-GCM(DEK, content)
AI Keys, Chat Blobs, Notes: AES-256-GCM(MASTER, payload)
```

- **In-Memory Master Key:** The master key never touches the disk. It is stored in a sliding in-memory session and discarded immediately on vault lock or server restart.
- **Envelope Encryption:** Every file has its own unique Data Encryption Key (DEK). Re-keying (changing password) only re-wraps the DEKs—your large file content remains untouched and fast.
- **Local SQLite WAL:** SQLite runs in Write-Ahead Logging (WAL) mode with strict read-only sandboxing on AI agent data queries.

---

## 📱 Android & Termux Support

Phryvos runs natively inside **Termux / proot** environments on Android:

```bash
# Ensure standard glibc environment PATH:
export PATH=/usr/bin:/usr/sbin:/sbin:/bin:/usr/local/bin:$PATH

phryvos start
```

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16.4.0 (App Router, Node runtime) + React 19.3.0
- **Language**: TypeScript ~5.9
- **Styling**: Tailwind CSS 4.3.3
- **Database**: SQLite (`better-sqlite3`) + Drizzle ORM
- **Cryptography**: Node built-in `crypto` (scrypt, AES-256-GCM)
- **AI SDKs**: `openai@7.32.0`, `@anthropic-ai/sdk@0.133.0`
- **Editor**: `@monaco-editor/react` (SSR off, lazy loaded)
- **Scheduling**: `node-cron`

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a PR.

```bash
git checkout -b feature/my-new-feature
git commit -am 'Add some feature'
git push origin feature/my-new-feature
```

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.