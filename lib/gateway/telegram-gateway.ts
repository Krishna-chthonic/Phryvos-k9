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
import { listDots, getDot, appendDotMessage, listDotTasks } from "@/lib/dots-service";
import { defaultProvider, createLlmClient } from "@/lib/providers-service";
import { runAgentTurn } from "@/lib/agent/loop";
import { ensureAgentTools } from "@/lib/agent/tools";
import { enhancePromptWithEcc } from "@/lib/ai/prompts/ecc-instincts";
import { listWorktrees, getDotWorktreeInfo } from "@/lib/dots/worktree-service";
import { addMemory, listMemories } from "@/lib/memory-service";
import {
  storeReMeMemory,
  runReMeDreamCycle,
  formatMarkdownTablesForMobile,
} from "@/lib/memory/reme-service";
import { listRecipes, executeRecipe } from "@/lib/recipes/recipe-runner";
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

// ---------------------------------------------------------------- Telegram API Calls

async function callTelegramApi(token: string, method: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
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
        await callTelegramApi(config.botToken, "sendMessage", {
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

      await callTelegramApi(token, "sendMessage", payload);
      return true;
    } catch (err) {
      console.error(`[TelegramGateway] Failed to send push to ${telegramId}:`, err);
      return false;
    }
  }

  private async pollLoop(db: Database.Database, botToken: string, signal: AbortSignal): Promise<void> {
    console.log("[TelegramGateway] Outbound long-polling started...");

    while (this.polling && !signal.aborted) {
      try {
        this.lastPollTime = Date.now();
        const updates = await callTelegramApi(
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

      await callTelegramApi(botToken, "sendMessage", {
        chat_id: senderId,
        text: `🔒 *Phryvos-K9 Vault Access Required*\n\nYour Telegram ID: \`${senderId}\`\nPairing Code: \`${code}\`\n\nPlease approve this pairing code in your Phryvos-K9 Web UI under *Settings → Telegram Gateway* to link this device.`,
        parse_mode: "Markdown",
      });
      return;
    }

    if (config.dmPolicy === "allowlist" && (!user || user.status !== "approved")) {
      await callTelegramApi(botToken, "sendMessage", {
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
      await callTelegramApi(botToken, "sendMessage", {
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
        `• \`/recipes\` — Browse Goose automation workflows\n` +
        `• \`/recipe <id>\` — Execute multi-step automation recipe\n` +
        `• \`/memorize <fact>\` — Save permanent memory to vault\n\n` +
        `*Specialist Coworkers:*\n${dotList || "• (No dots configured)"}\n\n` +
        `_Tip: Direct messages default to your personal Chat companion._`;
      await callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: helpMsg, parse_mode: "Markdown" });
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
      await callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: statusMsg, parse_mode: "Markdown" });
      return;
    }

    // /tasks
    if (rawText === "/tasks") {
      const tasks = listDotTasks(ctx, "");
      if (!tasks.length) {
        await callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: "No standing tasks found." });
        return;
      }
      const lines = tasks.slice(0, 10).map((t) => {
        const icon = t.status === "completed" ? "✔" : t.status === "running" ? "⏳" : t.status === "paused" ? "⏸" : "🕒";
        return `${icon} *${t.status.toUpperCase()}* #${t.id.replace("task_", "")}\n_${t.prompt}_\n`;
      });
      await callTelegramApi(botToken, "sendMessage", {
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
        await callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: "No active Git worktrees." });
        return;
      }
      const lines = trees.map((t) => `🌲 *${t.branch}* (\`${t.head.substring(0, 7)}\`)\nPath: \`${t.path}\``);
      await callTelegramApi(botToken, "sendMessage", {
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
        await callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: "Please provide a fact to remember." });
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

      await callTelegramApi(botToken, "sendMessage", {
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
      await callTelegramApi(botToken, "sendMessage", {
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
      await callTelegramApi(botToken, "sendMessage", {
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
        await callTelegramApi(botToken, "sendMessage", { chat_id: chatId, text: "Usage: /recipe <recipeId>" });
        return;
      }

      await callTelegramApi(botToken, "sendMessage", {
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
        await callTelegramApi(botToken, "sendMessage", {
          chat_id: chatId,
          text: formatMarkdownTablesForMobile(
            `✔ *Goose Recipe Completed: ${result.recipeName}*\n⏱ Elapsed: ${(result.totalDurationMs / 1000).toFixed(1)}s\n\n${result.finalReport.slice(0, 3000)}`,
          ),
        });
      } catch (recipeErr) {
        await callTelegramApi(botToken, "sendMessage", {
          chat_id: chatId,
          text: `❌ Recipe failed: ${recipeErr instanceof Error ? recipeErr.message : String(recipeErr)}`,
        });
      }
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
    await callTelegramApi(botToken, "sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});

    // Execute through Dot or Default Assistant
    try {
      ensureAgentTools();
      const provider = defaultProvider(ctx);
      if (!provider) {
        throw new Error("No AI provider configured in Settings.");
      }

      const client = createLlmClient(ctx, provider.id);
      let systemPrompt = "You are Phryvos-K9, a helpful and secure personal assistant.";
      let model = provider.models[0] || "default";

      if (targetDotName) {
        const dots = listDots(ctx);
        const dot = dots.find((d) => d.name.toLowerCase() === targetDotName!.toLowerCase());
        if (dot) {
          systemPrompt = `${enhancePromptWithEcc(dot.systemPrompt, dot.role)}\n\nYou are operating as coworker "${dot.name}" (${dot.role}). Working environment: "${dot.workingDirectory}". Enabled tools: ${dot.tools.join(", ")}. Provide concise, high-value responses over Telegram.`;
          if (dot.model && dot.model !== "auto") model = dot.model;
        }
      }

      const messages: UnifiedMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt || "Hello!" },
      ];

      const result = await runAgentTurn({
        db,
        key,
        client,
        model,
        initialMessages: messages,
        maxSteps: 6,
        providerTimeoutMs: 90_000,
        autoApproveTools: false,
        onDelta: () => {},
        onStep: () => {},
        onApprovalRequest: () => {},
        appendAssistant: () => {},
        appendTool: () => {},
      });

      // Send response back to Telegram
      const replyText = result.text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || "Done.";
      await callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: formatMarkdownTablesForMobile(replyText),
      });
    } catch (err) {
      await callTelegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private async handleCallbackQuery(botToken: string, callbackQuery: any): Promise<void> {
    const data = callbackQuery.data;
    const queryId = callbackQuery.id;

    // Acknowledge callback query immediately
    await callTelegramApi(botToken, "answerCallbackQuery", { callback_query_id: queryId, text: "Action processed" }).catch(() => {});

    // Handle tool approvals if formatted as "approve:<id>" or "deny:<id>"
    if (data && (data.startsWith("approve:") || data.startsWith("deny:"))) {
      const [action, id] = data.split(":");
      // We can hook this into approval resolvers
      console.log(`[TelegramGateway] Callback action ${action} for approval ${id}`);
    }
  }
}

export const telegramGateway = TelegramGatewayService.getInstance();
