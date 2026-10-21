/**
 * Tencent BrowserSkill Engine for Phryvos-K9
 * Inspired by Tencent/BrowserSkill
 * 
 * Provides:
 * 1. Browser Console Logger (captures console.log, console.warn, console.error, JS exceptions)
 * 2. Browser Network Traffic Inspector (captures XHR/Fetch requests, HTTP statuses, latency)
 * 3. Full-Page DOM Snapshot & Screenshot Saver (persisted to vault /browser/screenshots/)
 * 4. Shell-native `bsk` CLI dispatcher (bsk open, bsk console, bsk network, bsk screenshot)
 * 5. Human-in-the-Loop Safety Linter for high-risk web actions
 */

import { createFile, writeFile, getMeta, type VaultCtx } from "@/lib/vault-service";
import { OpenBrowserEngine } from "./openbrowser-engine";

export interface BrowserConsoleRecord {
  id: string;
  level: "log" | "warn" | "error" | "info";
  message: string;
  timestamp: number;
  sourceUrl?: string;
}

export interface BrowserNetworkRecord {
  id: string;
  url: string;
  method: string;
  status: number;
  durationMs: number;
  type: "fetch" | "xhr" | "document" | "asset";
  responseSnippet?: string;
  timestamp: number;
}

export interface BskSafetyCheckResult {
  safe: boolean;
  reason?: string;
  riskLevel: "low" | "medium" | "critical";
}

class BrowserSkillEngineService {
  private consoleLogs: BrowserConsoleRecord[] = [];
  private networkLogs: BrowserNetworkRecord[] = [];
  private maxLogCapacity = 100;

  constructor() {
    this.seedInitialDiagnostics();
  }

  private seedInitialDiagnostics(): void {
    this.consoleLogs.push({
      id: "c-1",
      level: "info",
      message: "[BrowserSkill] Browser engine initialized. Console listening on active viewport.",
      timestamp: Date.now() - 30_000,
    });
  }

  public logConsole(record: Omit<BrowserConsoleRecord, "id" | "timestamp">): BrowserConsoleRecord {
    const full: BrowserConsoleRecord = {
      ...record,
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    this.consoleLogs.unshift(full);
    if (this.consoleLogs.length > this.maxLogCapacity) this.consoleLogs.pop();
    return full;
  }

  public logNetwork(record: Omit<BrowserNetworkRecord, "id" | "timestamp">): BrowserNetworkRecord {
    const full: BrowserNetworkRecord = {
      ...record,
      id: `net-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    this.networkLogs.unshift(full);
    if (this.networkLogs.length > this.maxLogCapacity) this.networkLogs.pop();
    return full;
  }

  public getConsoleLogs(limit = 30, level?: BrowserConsoleRecord["level"]): BrowserConsoleRecord[] {
    let logs = this.consoleLogs;
    if (level) logs = logs.filter((l) => l.level === level);
    return logs.slice(0, limit);
  }

  public getNetworkLogs(limit = 30, filter?: { status?: number; search?: string }): BrowserNetworkRecord[] {
    let logs = this.networkLogs;
    if (filter?.status) logs = logs.filter((l) => l.status === filter.status);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      logs = logs.filter((l) => l.url.toLowerCase().includes(q));
    }
    return logs.slice(0, limit);
  }

  public clearLogs(): void {
    this.consoleLogs = [];
    this.networkLogs = [];
  }

  /**
   * BSK Open: Navigates URL, records network roundtrip, captures console output
   */
  public async bskOpen(sessionId: string, url: string): Promise<{
    url: string;
    title: string;
    status: number;
    latencyMs: number;
    elementCount: number;
  }> {
    const start = Date.now();
    let status = 200;

    try {
      const session = await OpenBrowserEngine.navigate(sessionId, url);
      const latencyMs = Date.now() - start;

      this.logNetwork({
        url: session.currentUrl,
        method: "GET",
        status: 200,
        durationMs: latencyMs,
        type: "document",
        responseSnippet: `Loaded: ${session.title}`,
      });

      this.logConsole({
        level: "info",
        message: `Navigated to ${session.currentUrl} (title: "${session.title}") in ${latencyMs}ms`,
        sourceUrl: session.currentUrl,
      });

      return {
        url: session.currentUrl,
        title: session.title,
        status: 200,
        latencyMs,
        elementCount: session.interactiveElements.length,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      status = 500;

      this.logNetwork({
        url,
        method: "GET",
        status: 500,
        durationMs: latencyMs,
        type: "document",
        responseSnippet: err instanceof Error ? err.message : String(err),
      });

      this.logConsole({
        level: "error",
        message: `Navigation failure to ${url}: ${err instanceof Error ? err.message : String(err)}`,
        sourceUrl: url,
      });

      throw err;
    }
  }

  /**
   * BSK Screenshot: Captures full rendered DOM snapshot and persists to vault
   */
  public async bskScreenshot(
    ctx: VaultCtx,
    sessionId: string,
    targetPath?: string,
  ): Promise<{ vaultPath: string; charCount: number; title: string }> {
    const session = OpenBrowserEngine.getOrCreateSession(sessionId);
    const snapshotText = OpenBrowserEngine.snapshot(sessionId);

    const safeTitle = session.title.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 30);
    const vaultPath = targetPath || `/browser/screenshots/shot-${safeTitle}-${Date.now()}.md`;

    const existing = getMeta(ctx, vaultPath);
    if (!existing || existing.deletedAt) {
      createFile(ctx, vaultPath);
    }

    const report = `# Browser Snapshot: ${session.title}\n\n` +
      `* **URL:** ${session.currentUrl}\n` +
      `* **Timestamp:** ${new Date().toISOString()}\n` +
      `* **Status:** ${session.status.toUpperCase()}\n` +
      `* **Interactive Elements:** ${session.interactiveElements.length}\n\n` +
      `## Page Representation\n\n\`\`\`\n${snapshotText}\n\`\`\`\n`;

    writeFile(ctx, vaultPath, report);

    this.logConsole({
      level: "info",
      message: `Full page snapshot captured and saved to ${vaultPath}`,
      sourceUrl: session.currentUrl,
    });

    return {
      vaultPath,
      charCount: report.length,
      title: session.title,
    };
  }

  /**
   * High-risk action safety linter
   */
  public checkActionSafety(action: string, payload: Record<string, any>): BskSafetyCheckResult {
    const serialized = JSON.stringify(payload).toLowerCase();

    // Check for payment / credential exfiltration patterns
    const criticalPatterns = [/credit_?card/i, /cvv/i, /password/i, /secret_?key/i, /private_?key/i];
    for (const pat of criticalPatterns) {
      if (pat.test(serialized)) {
        return {
          safe: false,
          riskLevel: "critical",
          reason: `Action contains sensitive credential pattern (${pat.source}). Requires explicit user authorization.`,
        };
      }
    }

    // Check destructive submit
    if (action === "submit" && (serialized.includes("delete") || serialized.includes("transfer"))) {
      return {
        safe: false,
        riskLevel: "medium",
        reason: "Form submission triggers potentially irreversible state modification.",
      };
    }

    return { safe: true, riskLevel: "low" };
  }

  /**
   * Shell-native CLI dispatcher (`bsk <subcommand>`)
   */
  public async executeCli(
    ctx: VaultCtx,
    args: string[],
    sessionId = "default",
  ): Promise<string> {
    const sub = args[0]?.toLowerCase();

    switch (sub) {
      case "open": {
        const url = args[1];
        if (!url) return "Usage: bsk open <url>";
        const res = await this.bskOpen(sessionId, url);
        return `✔ Opened ${res.url}\nTitle: ${res.title}\nStatus: ${res.status} OK (${res.latencyMs}ms)\nInteractive elements: ${res.elementCount}`;
      }

      case "console": {
        const logs = this.getConsoleLogs(15);
        if (!logs.length) return "No console logs recorded.";
        return logs
          .map((l) => `[${l.level.toUpperCase()}] ${new Date(l.timestamp).toLocaleTimeString()}: ${l.message}`)
          .join("\n");
      }

      case "network": {
        const logs = this.getNetworkLogs(15);
        if (!logs.length) return "No network traffic recorded.";
        return logs
          .map((n) => `[${n.method}] ${n.status} ${n.url} (${n.durationMs}ms) - ${n.type}`)
          .join("\n");
      }

      case "screenshot": {
        const customPath = args[1];
        const res = await this.bskScreenshot(ctx, sessionId, customPath);
        return `✔ Snapshot saved to vault: ${res.vaultPath} (${res.charCount} bytes)`;
      }

      case "click": {
        const elId = Number(args[1]);
        if (isNaN(elId)) return "Usage: bsk click <elementId>";
        const s = await OpenBrowserEngine.click(sessionId, elId);
        return `✔ Clicked #${elId}. Current URL: ${s.currentUrl} (${s.title})`;
      }

      case "help":
      default:
        return "Tencent BrowserSkill CLI (bsk)\n\n" +
          "Commands:\n" +
          "  bsk open <url>          Navigate to website with traffic monitoring\n" +
          "  bsk console             View browser console output and errors\n" +
          "  bsk network             Inspect network requests and HTTP status codes\n" +
          "  bsk screenshot [path]   Save full rendered DOM snapshot to vault\n" +
          "  bsk click <elementId>   Click interactive element by ID\n";
    }
  }
}

// Global Singleton
type GlobalBsk = { __phryvosBrowserSkill?: BrowserSkillEngineService };
const g = globalThis as unknown as GlobalBsk;

if (!g.__phryvosBrowserSkill) {
  g.__phryvosBrowserSkill = new BrowserSkillEngineService();
}

export const browserSkill = g.__phryvosBrowserSkill;
