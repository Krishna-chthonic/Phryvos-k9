/**
 * OpenClaw Master Gateway for Phryvos-K9
 * Inspired by openclaw/openclaw & agentscope-ai/QwenPaw
 * 
 * Provides:
 * 1. Outbound Long-Polling connection (Zero Public IP, Zero Port Forwarding)
 * 2. Strict DM Pairing & Telegram User ID Whitelist
 * 3. Multi-Agent Slash Dispatcher (/chat, /dot <name>, /tasks, /worktrees, /status, /memorize)
 * 4. Proactive Push Notification Bridge (Dots alert you on phone when done)
 * 5. Interactive Inline Callback Approvals
 */

import type Database from "better-sqlite3";
import { getActiveMasterKey } from "@/lib/session/store";
import {
  listDots,
  getDot,
  appendDotMessage,
  listDotTasks,
  listDotMessages,
  listDotSpaces,
  formatSpacesContext,
} from "@/lib/dots-service";
import { createSession, getSession, listMessages, appendMessage } from "@/lib/chat-service";
import { defaultProvider, createLlmClient } from "@/lib/providers-service";
import { runAgentTurn } from "@/lib/agent/loop";
import { ensureAgentTools } from "@/lib/agent/tools";
import { resolveAllowedTools } from "@/lib/dots-runner";
import { enhancePromptWithEcc } from "@/lib/ai/prompts/ecc-instincts";
import { listWorktrees, getDotWorktreeInfo } from "@/lib/dots/worktree-service";
import { addMemory, listMemories } from "@/lib/memory-service";
import {
  storeReMeMemory,
  runReMeDreamCycle,
  formatMarkdownTablesForMobile,
} from "@/lib/memory/reme-service";
import { listRecipes, executeRecipe } from "@/lib/recipes/recipe-runner";
import {
  reachWeb,
  reachGithub,
  reachReddit,
  reachYouTube,
  reachTweet,
  runAgentReachDoctor,
} from "@/lib/agent/reach-service";
import { swarmEngine, type SwarmTopology } from "@/lib/swarm/swarm-engine";
import type { UnifiedMessage } from "@/lib/ai/types";

export interface GatewayConfig {
  botToken: string;
  enabled: boolean;
  dmPolicy: "pairing" | "allowlist" | "open";
  updatedAt: number;
}

export interface TelegramUser {
  id: number;
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  status: "pending" | "approved" | "rejected";
  pairingCode?: string | null;
  pairedAt?: number | null;
  createdAt: number;
}

// ---------------------------------------------------------------- Database Init

export function initGatewayDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_gateway_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      bot_token TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      dm_policy TEXT NOT NULL DEFAULT 'pairing',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telegram_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      pairing_code TEXT,
      paired_at INTEGER,
      created_at INTEGER NOT NULL
    );
  `);

  // Ensure default config row exists
  const existing = db.prepare("SELECT id FROM telegram_gateway_config WHERE id = 1").get();
  if (!existing) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO telegram_gateway_config (id, bot_token, enabled, dm_policy, created_at, updated_at)
      VALUES (1, '', 0, 'pairing', ?, ?)
    `).run(now, now);
  }
}

export function getGatewayConfig(db: Database.Database): GatewayConfig {
  initGatewayDb(db);
  const row = db.prepare("SELECT bot_token, enabled, dm_policy, updated_at FROM telegram_gateway_config WHERE id = 1").get() as any;
  return {
    botToken: row?.bot_token || "",
    enabled: Boolean(row?.enabled),
    dmPolicy: (row?.dm_policy as any) || "pairing",
    updatedAt: row?.updated_at || Date.now(),
  };
}

export function updateGatewayConfig(db: Database.Database, config: Partial<GatewayConfig>): GatewayConfig {
  initGatewayDb(db);
  const current = getGatewayConfig(db);
  const updated: GatewayConfig = {
    botToken: config.botToken !== undefined ? config.botToken.trim() : current.botToken,
    enabled: config.enabled !== undefined ? config.enabled : current.enabled,
    dmPolicy: config.dmPolicy !== undefined ? config.dmPolicy : current.dmPolicy,
    updatedAt: Date.now(),
  };

  db.prepare(`
    UPDATE telegram_gateway_config
    SET bot_token = ?, enabled = ?, dm_policy = ?, updated_at = ?
    WHERE id = 1
  `).run(updated.botToken, updated.enabled ? 1 : 0, updated.dmPolicy, updated.updatedAt);

  return updated;
}

export function listTelegramUsers(db: Database.Database): TelegramUser[] {
  initGatewayDb(db);
  const rows = db.prepare("SELECT * FROM telegram_users ORDER BY created_at DESC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    telegramId: r.telegram_id,
    username: r.username,
    firstName: r.first_name,
    status: r.status,
    pairingCode: r.pairing_code,
    pairedAt: r.paired_at,
    createdAt: r.created_at,
  }));
}

export function approvePairing(db: Database.Database, codeOrId: string): { success: boolean; message: string } {
  initGatewayDb(db);
  const cleaned = codeOrId.trim();
  const user = db.prepare(`
    SELECT * FROM telegram_users
    WHERE pairing_code = ? OR telegram_id = ?
  `).get(cleaned, cleaned) as any;

  if (!user) {
    return { success: false, message: `No pending pairing found for "${cleaned}".` };
  }

  const now = Date.now();
  db.prepare(`
    UPDATE telegram_users
    SET status = 'approved', paired_at = ?, pairing_code = NULL
    WHERE id = ?
  `).run(now, user.id);

  return { success: true, message: `Approved Telegram user ${user.username || user.telegram_id}!` };
}

export function revokeTelegramUser(db: Database.Database, telegramId: string): void {
  initGatewayDb(db);
  db.prepare("DELETE FROM telegram_users WHERE telegram_id = ?").run(telegramId.trim());
}

// ---------------------------------------------------------------- Gateway Polling Daemon

type GlobalGateway = { __phryvosTelegramGateway?: TelegramGatewayService };
const g = globalThis as unknown as GlobalGateway;

export class TelegramGatewayService {
  private polling = false;
  private abortController: AbortController | null = null;
  private offset = 0;
  private lastPollTime = 0;

  public static getInstance(): TelegramGatewayService {
    if (!g.__phryvosTelegramGateway) {
      g.__phryvosTelegramGateway = new TelegramGatewayService();
    }
    return g.__phryvosTelegramGateway;
  }

  public isRunning(): boolean {
    return this.polling;
  }

  public getLastPollTime(): number {
    return this.lastPollTime;
  }

  private async callTelegramApi(token: string, method: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    const data = await res.json();
    if (!data.ok) {
      throw new Error(`Telegram API ${method} failed: ${data.description || "unknown"}`);
    }
    return data.result;
  }

  public async start(db: Database.Database, botToken: string): Promise<void> {
    if (this.polling) return;
    if (!botToken || !botToken.includes(":")) {
      throw new Error("Invalid Telegram Bot Token");
    }

    this.polling = true;
    this.abortController = new AbortController();

    // Start background poll loop
    void this.pollLoop(db, botToken, this.abortController.signal);
  }

  public stop(): void {
    this.polling = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Broadcast push notification to all approved Telegram users
   */
  public async broadcast(db: Database.Database, text: string): Promise<number> {
    const config = getGatewayConfig(db);
    if (!config.botToken) return 0;

    const approved = listTelegramUsers(db).filter((u) => u.status === "approved");
    let sent = 0;

    for (const u of approved) {
      try {
        await this.callTelegramApi(config.botToken, "sendMessage", {
          chat_id: u.telegramId,
          text,
          parse_mode: "Markdown",
        });
        sent++;
      } catch (err) {
        console.error(`[TelegramGateway] Push error to ${u.telegramId}:`, err);
      }
    }
    return sent;
  }

  /**
   * Direct push message to specific telegramId with optional action buttons
   * @deprecated Use safeSendTelegramMessage for chunking and fallback support
   */
  public async sendPush(
    token: string,
    telegramId: string,
    text: string,
    buttons?: Array<{ text: string; data: string }>,
  ): Promise<boolean> {
    try {
      const payload: Record<string, unknown> = {
        chat_id: telegramId,
        text,
        parse_mode: "Markdown",
      };

      if (buttons && buttons.length > 0) {
        payload.reply_markup = {
          inline_keyboard: [buttons.map((b) => ({ text: b.text, callback_data: b.data }))],
        };
      }

      await this.callTelegramApi(token, "sendMessage", payload);
      return true;
    } catch (err) {
      console.error(`[TelegramGateway] Failed to send push to ${telegramId}:`, err);
      return false;
    }
  }

  /**
   * Safely send a Telegram message with automatic chunking (4000 char limit)
   * and Markdown parse failure fallback to plain text.
   *
   * Telegram's sendMessage has a 4096 char limit but Markdown entities consume extra space.
   * We use 4000 as a safe boundary. On Markdown parse errors, we retry without parse_mode.
   *
   * Buttons are only included in the first chunk.
   */
  public async safeSendTelegramMessage(
    db: Database.Database,
    token: string,
    telegramId: string,
    text: string,
    buttons?: Array<{ text: string; data: string }>,
  ): Promise<number> {
    const CHUNK_SIZE = 4000;
    let sent = 0;
    let isFirstChunk = true;

    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      const chunk = text.slice(i, i + CHUNK_SIZE);
      let success = false;

      // Try with Markdown first
      for (let attempt = 0; attempt < 2; attempt++) {
        const useMarkdown = attempt === 0;
        try {
          const payload: Record<string, unknown> = {
            chat_id: telegramId,
            text: chunk,
          };

          if (useMarkdown) {
            payload.parse_mode = "Markdown";
          }

          if (isFirstChunk && buttons && buttons.length > 0) {
            payload.reply_markup = {
              inline_keyboard: [buttons.map((b) => ({ text: b.text, callback_data: b.data }))],
            };
          }

          await this.callTelegramApi(token, "sendMessage", payload);
          sent++;
          success = true;
          break;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const isParseError = errorMsg.includes("can't parse entities") || errorMsg.includes("Bad Request");
          if (!useMarkdown || !isParseError) {
            // If plain text also fails, or it's not a parse error, don't retry
            console.error(`[TelegramGateway] Failed to send chunk ${sent + 1}:`, err);
            break;
          }
          // Markdown parse error - will retry without parse_mode
        }
      }

      if (!success) {
        // Even if one chunk fails, continue with remaining chunks
        console.error(`[TelegramGateway] Giving up on chunk ${sent + 1} after retries`);
      }

      isFirstChunk = false;
    }

    return sent;
  }

  private async pollLoop(db: Database.Database, botToken: string, signal: AbortSignal): Promise<void> {
    console.log("[TelegramGateway] Outbound long-polling started...");

    while (this.polling && !signal.aborted) {
      try {
        this.lastPollTime = Date.now();
        const updates = await this.callTelegramApi(
          botToken,
          "getUpdates",
          {
            offset: this.offset,
            timeout: 25, // 25s long-poll
            allowed_updates: ["message", "callback_query"],
          },
          signal,
        );

        if (Array.isArray(updates)) {
          for (const update of updates) {
            this.offset = update.update_id + 1;
            await this.handleUpdate(db, botToken, update);
          }
        }
      } catch (err) {
        if (signal.aborted) break;
        console.error("[TelegramGateway] Polling error (backing off 5s):", err);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    this.polling = false;
    console.log("[TelegramGateway] Polling loop stopped.");
  }

  private async handleUpdate(db: Database.Database, botToken: string, update: any): Promise<void> {
    // 1. Handle Inline Button Callback Queries (Approvals)
    if (update.callback_query) {
      await this.handleCallbackQuery(botToken, update.callback_query);
      return;
    }

    const msg = update.message;
    if (!msg || !msg.from) return;

    const senderId = String(msg.from.id);
    const username = msg.from.username || null;
    const firstName = msg.from.first_name || null;
    const text = (msg.text || msg.caption || "").trim();

    // 2. Authentication & Pairing Gate
    const config = getGatewayConfig(db);
    const users = listTelegramUsers(db);
    let user = users.find((u) => u.telegramId === senderId);

    if (config.dmPolicy === "pairing" && (!user || user.status !== "approved")) {
      // User is not approved yet
      let code = user?.pairingCode;
      if (!code) {
        code = Math.floor(100000 + Math.random() * 900000).toString();
        const now = Date.now();
        db.prepare(`
          INSERT INTO telegram_users (telegram_id, username, first_name, status, pairing_code, created_at)
          VALUES (?, ?, ?, 'pending', ?, ?)
          ON CONFLICT(telegram_id) DO UPDATE SET
            pairing_code = excluded.pairing_code,
            username = excluded.username,
            first_name = excluded.first_name
        `).run(senderId, username, firstName, code, now);
      }

      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: senderId,
        text: `🔒 *Phryvos-K9 Vault Access Required*\n\nYour Telegram ID: \`${senderId}\`\nPairing Code: \`${code}\`\n\nPlease approve this pairing code in your Phryvos-K9 Web UI under *Settings → Telegram Gateway* to link this device.`,
        parse_mode: "Markdown",
      });
      return;
    }

    if (config.dmPolicy === "allowlist" && (!user || user.status !== "approved")) {
      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: senderId,
        text: `⛔ *Access Denied*\nYour Telegram ID (\`${senderId}\`) is not on the Phryvos-K9 whitelist.`,
        parse_mode: "Markdown",
      });
      return;
    }

    // 3. Authenticated: Dispatch Slash Commands & Messages
    await this.dispatchMessage(db, botToken, senderId, text);
  }

  private async dispatchMessage(db: Database.Database, botToken: string, chatId: string, rawText: string): Promise<void> {
    const key = getActiveMasterKey();
    if (!key) {
      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: "🔐 *Vault is Locked*\nPlease unlock your Phryvos-K9 vault from your browser before executing commands.",
        parse_mode: "Markdown",
      });
      return;
    }

    const ctx = { db, key };

    // /start or /help
    if (rawText === "/start" || rawText === "/help") {
      const dots = listDots(ctx);
      const dotList = dots.map((d) => `• \`/${d.name.toLowerCase()}\` — ${d.role}`).join("\n");
      const helpMsg = `🤖 *Phryvos-K9 Remote Command Hub*\n\n` +
        `*Available Commands:*\n` +
        `• \`/chat <msg>\` — Talk to personal 1-on-1 AI companion\n` +
        `• \`/tasks\` — View active Kanban company tasks\n` +
        `• \`/worktrees\` — Inspect active Git worktrees\n` +
        `• \`/status\` — System status & active dots\n` +
        `• \`/swarm <goal>\` — Spawn multi-agent swarm team\n` +
        `• \`/swarm_status\` — Live swarm topology & blackboard\n` +
        `• \`/recipes\` — Browse Goose automation workflows\n` +
        `• \`/recipe <id>\` — Execute multi-step automation recipe\n` +
        `• \`/reach <url>\` — Extract clean web/YT/Reddit/X content\n` +
        `• \`/doctor\` — Check Agent-Reach channel health\n` +
        `• \`/memorize <fact>\` — Save permanent memory to vault\n\n` +
        `*Specialist Coworkers:*\n${dotList || "• (No dots configured)"}\n\n` +
        `_Tip: Direct messages default to your personal Chat companion._`;
      await this.callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: helpMsg, parse_mode: "Markdown" });
      return;
    }

    // /status
    if (rawText === "/status") {
      const dots = listDots(ctx);
      const tasks = listDotTasks(ctx, "");
      const activeTasks = tasks.filter((t) => t.status === "running" || t.status === "queued");
      const statusMsg = `📊 *Phryvos-K9 Live Status*\n\n` +
        `• *Vault:* 🔓 Unlocked & Active\n` +
        `• *Active Coworkers:* ${dots.length}\n` +
        `• *Queued/Running Tasks:* ${activeTasks.length}\n` +
        `• *Node.js Runtime:* ${process.version} (Linux ARM64)\n` +
        `• *Memory RSS:* ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`;
      await this.callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: statusMsg, parse_mode: "Markdown" });
      return;
    }

    // /tasks
    if (rawText === "/tasks") {
      const tasks = listDotTasks(ctx, "");
      if (!tasks.length) {
        await this.callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: "No standing tasks found." });
        return;
      }
      const lines = tasks.slice(0, 10).map((t) => {
        const icon = t.status === "completed" ? "✔" : t.status === "running" ? "⏳" : t.status === "paused" ? "⏸" : "🕒";
        return `${icon} *${t.status.toUpperCase()}* #${t.id.replace("task_", "")}\n_${t.prompt}_\n`;
      });
      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: `📋 *Company Task Board (Top 10)*\n\n${lines.join("\n")}`,
        parse_mode: "Markdown",
      });
      return;
    }

    // /worktrees
    if (rawText === "/worktrees") {
      const trees = await listWorktrees();
      if (!trees.length) {
        await this.callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: "No active Git worktrees." });
        return;
      }
      const lines = trees.map((t) => `🌲 *${t.branch}* (\`${t.head.substring(0, 7)}\`)\nPath: \`${t.path}\``);
      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: `🌲 *Active Git Worktrees (${trees.length})*\n\n${lines.join("\n\n")}`,
        parse_mode: "Markdown",
      });
      return;
    }

    // /memorize <fact> or /reme <key>=<value>
    if (rawText.startsWith("/memorize ") || rawText.startsWith("/reme ")) {
      const fact = rawText.replace(/^\/(memorize|reme)\s+/, "").trim();
      if (!fact) {
        await this.callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: "Please provide a fact to remember." });
        return;
      }
      addMemory(db, fact);
      const title = fact.length <= 35 ? fact : `${fact.slice(0, 30)}...`;
      const remeDoc = await storeReMeMemory(ctx, {
        title,
        content: fact,
        category: "telegram",
        tags: ["telegram", "quick-note"],
        source: `telegram:${chatId}`,
      });

      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: `🧠 *Memory Saved (ReMe 3-Layer Format):*\n\n"${fact}"\n\n_Encrypted File: ${remeDoc.vaultPath}_`,
        parse_mode: "Markdown",
      });
      return;
    }

    // /dream (QwenPaw auto-dream memory consolidation)
    if (rawText === "/dream") {
      const dreamRes = await runReMeDreamCycle(ctx);
      const filesMsg = dreamRes.newFiles.length
        ? `\n\n*Synthesized Knowledge Docs:*\n${dreamRes.newFiles.map((f) => `• \`${f}\``).join("\n")}`
        : "";
      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: `🌙 *ReMe Dream Cycle Completed*\n\n• Consolidated Facts: ${dreamRes.consolidated}\n• New Vault Docs: ${dreamRes.newFiles.length}${filesMsg}`,
        parse_mode: "Markdown",
      });
      return;
    }

    // /recipes (Goose Automation Recipes list)
    if (rawText === "/recipes") {
      const allRecipes = listRecipes(ctx);
      const lines = allRecipes.map((r) => `• \`/recipe ${r.id}\` — *${r.name}* (${r.steps.length} steps)\n  _${r.description}_`);
      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: `📜 *Available Goose Automation Recipes (${allRecipes.length})*\n\n${lines.join("\n\n")}\n\n_Execute with: /recipe <id> [param=value]_`,
        parse_mode: "Markdown",
      });
      return;
    }

    // /recipe <id> [param=value ...]
    if (rawText.startsWith("/recipe ")) {
      const parts = rawText.substring(8).trim().split(/\s+/);
      const recipeId = parts[0]?.toLowerCase();
      if (!recipeId) {
        await this.callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: "Usage: /recipe <recipeId>" });
        return;
      }

      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: `⏳ *Launching Goose Recipe:* \`${recipeId}\`\nRunning multi-step autonomous execution in background...`,
        parse_mode: "Markdown",
      });

      // Parse optional key=value arguments
      const params: Record<string, string> = {};
      for (const p of parts.slice(1)) {
        const [k, v] = p.split("=");
        if (k && v) params[k] = v;
      }

      try {
        const result = await executeRecipe(ctx, recipeId, params);
        await this.callTelegramApi(botToken, "sendMessage", {
          chat_id: chatId,
          text: formatMarkdownTablesForMobile(
            `✔ *Goose Recipe Completed: ${result.recipeName}*\n⏱ Elapsed: ${(result.totalDurationMs / 1000).toFixed(1)}s\n\n${result.finalReport.slice(0, 3000)}`,
          ),
        });
      } catch (recipeErr) {
        await this.callTelegramApi(botToken, "sendMessage", {
          chat_id: chatId,
          text: `❌ Recipe failed: ${recipeErr instanceof Error ? recipeErr.message : String(recipeErr)}`,
        });
      }
      return;
    }

    // /doctor (Agent-Reach diagnostics)
    if (rawText === "/doctor") {
      const doc = await runAgentReachDoctor();
      const lines = doc.channels.map((c) => {
        const icon = c.status === "healthy" ? "✔" : c.status === "degraded" ? "⚠️" : "❌";
        return `${icon} *${c.name}* (\`${c.latencyMs}ms\`)\n  ${c.detail || c.status}`;
      });
      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: `🩺 *Agent-Reach Doctor Diagnostics*\n\n${lines.join("\n\n")}`,
        parse_mode: "Markdown",
      });
      return;
    }

    // /reach <url>
    if (rawText.startsWith("/reach ")) {
      const targetUrl = rawText.substring(7).trim();
      if (!targetUrl) {
        await this.callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: "Usage: /reach <url>" });
        return;
      }

      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: `🌐 *Reaching public web data...*\nAnalyzing source link across Agent-Reach channels...`,
        parse_mode: "Markdown",
      });

      try {
        let content = "";
        if (targetUrl.includes("youtube.com") || targetUrl.includes("youtu.be")) {
          const yt = await reachYouTube(targetUrl);
          content = `🎬 *YouTube:* ${yt.title}\n👤 *Creator:* ${yt.author}\n\n📝 *Transcript:*\n${yt.transcript.slice(0, 3000)}`;
        } else if (targetUrl.includes("reddit.com") || targetUrl.startsWith("r/")) {
          const red = await reachReddit(targetUrl);
          content = `💬 *Reddit (r/${red.subreddit}):* ${red.title}\n⬆ Upvotes: ${red.score}\n\n${red.selftext.slice(0, 800)}\n\n*Top Comments:*\n${red.comments.slice(0, 3).map((c) => `• *${c.author}:* ${c.body.slice(0, 300)}`).join("\n")}`;
        } else if (targetUrl.includes("twitter.com") || targetUrl.includes("x.com")) {
          const tw = await reachTweet(targetUrl);
          content = `🐦 *Tweet from @${tw.authorScreenName} (${tw.authorName}):*\n\n"${tw.text}"\n\n❤️ ${tw.likes} | 🔁 ${tw.retweets} | 💬 ${tw.replies}`;
        } else if (targetUrl.includes("github.com")) {
          const gh = await reachGithub(targetUrl);
          content = `🐙 *GitHub Repo:* ${gh.repo}\n⭐ Stars: ${gh.stars ?? 0}\n\n${(gh.readme || gh.description || "").slice(0, 2500)}`;
        } else {
          const web = await reachWeb(targetUrl, 3000);
          content = `📄 *${web.title}*\nSource: ${web.url} (${web.source})\n\n${web.markdown.slice(0, 3000)}`;
        }

        await this.callTelegramApi(botToken, "sendMessage", {
          chat_id: chatId,
          text: formatMarkdownTablesForMobile(content),
        });
      } catch (reachErr) {
        await this.callTelegramApi(botToken, "sendMessage", {
          chat_id: chatId,
          text: `❌ Reach failed: ${reachErr instanceof Error ? reachErr.message : String(reachErr)}`,
        });
      }
      return;
    }

    // /swarm_status
    if (rawText === "/swarm_status") {
      const state = swarmEngine.getState();
      const completedTasks = state.tasks.filter((t) => t.status === "completed").length;
      const recentBb = state.blackboard.slice(0, 3).map((e) => `• [${e.topic}] _<${e.authorRole}>:_ ${e.content}`).join("\n");

      const msg = `🐝 *Ruflo Swarm Status: [${state.status.toUpperCase()}]*\n\n` +
        `• *Topology:* \`${state.topology.toUpperCase()}\`\n` +
        `• *Goal:* ${state.goal}\n` +
        `• *Tasks:* ${completedTasks}/${state.tasks.length} completed\n` +
        `• *Active Agents:* ${state.agents.map((a) => `${a.avatar} ${a.name}`).join(", ")}\n` +
        `• *Consensus Ballots:* ${state.ballots.length}\n\n` +
        `*Recent Blackboard:*\n${recentBb || "_(none)_"}`;

      await this.callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: msg, parse_mode: "Markdown" });
      return;
    }

    // /swarm [topology] <goal>
    if (rawText.startsWith("/swarm ")) {
      const remainder = rawText.substring(7).trim();
      const parts = remainder.split(/\s+/);
      let topology: SwarmTopology = "hierarchical";
      let goal = remainder;

      if (["mesh", "hierarchical", "star", "consensus"].includes(parts[0].toLowerCase())) {
        topology = parts[0].toLowerCase() as SwarmTopology;
        goal = parts.slice(1).join(" ");
      }

      if (!goal) {
        await this.callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: "Usage: /swarm [mesh|hierarchical|star|consensus] <goal>" });
        return;
      }

      const session = swarmEngine.spawn(goal, topology);
      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: `🚀 *Swarm Spawned [${topology.toUpperCase()}]*\n\n*Goal:* "${goal}"\n*Agents Assigned:* ${session.agents.length}\n*Tasks Scheduled:* ${session.tasks.length}\n\n_Auto-executing swarm steps..._`,
        parse_mode: "Markdown",
      });

      // Run up to 4 autonomous steps
      for (let i = 0; i < 4; i++) {
        const stepRes = await swarmEngine.step(ctx);
        if (stepRes.session.status === "completed") {
          await this.callTelegramApi(botToken, "sendMessage", {
            chat_id: chatId,
            text: `🏁 *Swarm Completed Successfully!*\n\n${stepRes.stepMessage}`,
            parse_mode: "Markdown",
          });
          break;
        }
      }
      return;
    }

    // Reset/start fresh session command
    if (rawText === "/new" || rawText === "/reset") {
      db.prepare("DELETE FROM kv WHERE key = ?").run(`tg_session_${chatId}`);
      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: "✨ *New Session Started*\n\nYour active chat session has been reset. The next message will spawn a fresh conversation visible in your K9 localhost dashboard.",
        parse_mode: "Markdown",
      });
      return;
    }

    // Check if targeting specific Dot: /dot <name> <prompt> or /<dotName> <prompt>
    let targetDotName: string | null = null;
    let prompt = rawText;

    if (rawText.startsWith("/dot ")) {
      const parts = rawText.substring(5).trim().split(/\s+/);
      targetDotName = parts[0];
      prompt = parts.slice(1).join(" ");
    } else if (rawText.startsWith("/")) {
      const firstWord = rawText.substring(1).split(/\s+/)[0].toLowerCase();
      const dots = listDots(ctx);
      const match = dots.find((d) => d.name.toLowerCase() === firstWord);
      if (match) {
        targetDotName = match.name;
        prompt = rawText.substring(firstWord.length + 2).trim();
      }
    }

    // Send typing notification
    await this.callTelegramApi(botToken, "sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

    // Execute through Dot or Default Assistant with full Live DB persistence
    try {
      ensureAgentTools();
      const provider = defaultProvider(ctx);
      if (!provider) {
        throw new Error("No AI provider configured in Settings.");
      }

      const client = createLlmClient(ctx, provider.id);
      let model = provider.models[0] || "default";

      // -------------------------------------------------------------
      // PATH A: Target Dot Conversation (Synced to Dot Workspace)
      // -------------------------------------------------------------
      if (targetDotName) {
        const dots = listDots(ctx);
        const dot = dots.find((d) => d.name.toLowerCase() === targetDotName!.toLowerCase());
        if (!dot) {
          await this.callTelegramApi(botToken, "sendMessage", {
            chat_id: chatId,
            text: `⚠️ Dot coworker "${targetDotName}" not found. Type /dots to view your active roster.`,
          });
          return;
        }

        if (dot.model && dot.model !== "auto") model = dot.model;

        // 1. Persist User Prompt into Dot Workspace messages
        appendDotMessage(ctx, dot.id, {
          role: "user",
          content: prompt || "Hello!",
        });

        // 2. Load recent conversation history for memory continuity
        const dotHistory = listDotMessages(ctx, dot.id).slice(-8);
        const spaces = listDotSpaces(ctx, dot.id);
        const spacesContext = formatSpacesContext(spaces);
        const systemPrompt = `${enhancePromptWithEcc(dot.systemPrompt, dot.role)}\n\nYou are operating as coworker "${dot.name}" (${dot.role}). Working environment: "${dot.workingDirectory}". Enabled tools: ${dot.tools.join(", ")}. Provide concise, high-value responses over Telegram.${spacesContext}`;

        const messages: UnifiedMessage[] = [
          { role: "system", content: systemPrompt },
          ...dotHistory.slice(0, -1).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user", content: prompt || "Hello!" },
        ];

        const allowedTools = resolveAllowedTools(dot.tools);

        // 3. Run Agent loop
        const result = await runAgentTurn({
          db,
          key,
          client,
          model,
          allowedTools,
          initialMessages: messages,
          maxSteps: 8,
          providerTimeoutMs: 90_000,
          autoApproveTools: false,
          onDelta: () => {},
          onStep: () => {},
          onApprovalRequest: () => {},
          appendAssistant: () => {},
          appendTool: () => {},
        });

        const replyText = result.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || "Done.";

        // 4. Persist Dot Response so localhost:3000/dots displays it live
        appendDotMessage(ctx, dot.id, {
          role: "assistant",
          content: replyText,
        });

        // 5. Send Telegram reply
        await this.callTelegramApi(botToken, "sendMessage", {
          chat_id: chatId,
          text: formatMarkdownTablesForMobile(`🤖 *[${dot.name}]*\n\n${replyText}`),
          parse_mode: "Markdown",
        });
        return;
      }

      // -------------------------------------------------------------
      // PATH B: General K9 Assistant (Synced to Live Chat Sessions)
      // -------------------------------------------------------------
      // Look for active session mapped to this Telegram chat
      const kvKey = `tg_session_${chatId}`;
      const kvRow = db.prepare("SELECT value FROM kv WHERE key = ?").get(kvKey) as { value: string } | undefined;
      let sessionId = kvRow?.value;
      let sessionValid = false;

      if (sessionId) {
        try {
          const existing = getSession(ctx, sessionId);
          if (existing) sessionValid = true;
        } catch {
          sessionValid = false;
        }
      }

      if (!sessionValid) {
        const cleanSnippet = prompt.trim().slice(0, 28).replace(/[\r\n]+/g, " ");
        const title = `📱 Telegram: ${cleanSnippet || "Live Chat"}`;
        const newSession = createSession(ctx, {
          title,
          model,
          providerId: provider.id,
        });
        sessionId = newSession.id;
        db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").run(kvKey, sessionId);
      }

      // 1. Persist User Message into Chat Session
      appendMessage(ctx, sessionId!, {
        role: "user",
        content: prompt || "Hello!",
      });

      // 2. Load recent session history for context
      const sessionHistory = listMessages(ctx, sessionId!).slice(-8);
      const systemPrompt = "You are Phryvos-K9, a helpful and secure personal assistant.";

      const messages: UnifiedMessage[] = [
        { role: "system", content: systemPrompt },
        ...sessionHistory.slice(0, -1).map((m) => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
        { role: "user", content: prompt || "Hello!" },
      ];

      // 3. Run Agent loop
      const result = await runAgentTurn({
        db,
        key,
        client,
        model,
        initialMessages: messages,
        maxSteps: 8,
        providerTimeoutMs: 90_000,
        autoApproveTools: false,
        onDelta: () => {},
        onStep: () => {},
        onApprovalRequest: () => {},
        appendAssistant: () => {},
        appendTool: () => {},
      });

      const replyText = result.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || "Done.";

      // 4. Persist Assistant Message into Chat Session so localhost:3000/chat updates live
      appendMessage(ctx, sessionId!, {
        role: "assistant",
        content: replyText,
      });

      // 5. Send Telegram reply
      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: formatMarkdownTablesForMobile(replyText),
      });
    } catch (err) {
      await this.callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private async handleCallbackQuery(botToken: string, callbackQuery: any): Promise<void> {
    const data = callbackQuery.data;
    const queryId = callbackQuery.id;

    // Acknowledge callback query immediately
    await this.callTelegramApi(botToken, "answerCallbackQuery", { callback_query_id: queryId, text: "Action processed" }).catch(() => {});

    // Handle tool approvals if formatted as "approve:<id>" or "deny:<id>"
    if (data && (data.startsWith("approve:") || data.startsWith("deny:"))) {
      const [action, id] = data.split(":");
      // We can hook this into approval resolvers
      console.log(`[TelegramGateway] Callback action ${action} for approval ${id}`);
    }
  }
}

export const telegramGateway = TelegramGatewayService.getInstance();
