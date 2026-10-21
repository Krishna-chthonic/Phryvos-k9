/**
 * OpenBrowser Autonomous Web Browsing Engine for Phryvos-K9
 * Inspired by ntegrals/openbrowser
 * 
 * Provides:
 * 1. Stateful browser session (URL, history, cookies, interactive DOM elements)
 * 2. Numbered interactive element tree (#1, #2, #3...) for deterministic LLM control
 * 3. Action primitives: navigate, click, type, submit, scroll, goBack, snapshot
 * 4. Lightweight Termux-compatible headless simulation without heavy desktop browser bloat
 * 5. Full agent tools & live browser viewport panel
 */

import { isResolvedTargetPrivate } from "@/lib/agent/web-fetch";

export interface DomElement {
  id: number;
  tag: "a" | "button" | "input" | "select" | "textarea" | "form";
  text: string;
  selector: string;
  href?: string;
  name?: string;
  placeholder?: string;
  value?: string;
  inputType?: string;
}

export interface BrowserSession {
  sessionId: string;
  currentUrl: string;
  title: string;
  history: string[];
  historyIndex: number;
  interactiveElements: DomElement[];
  pageText: string;
  status: "idle" | "loading" | "error";
  lastAction?: {
    action: string;
    targetId?: number;
    value?: string;
    timestamp: number;
  };
}

const sessions = new Map<string, BrowserSession>();

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export class OpenBrowserEngine {
  public static getOrCreateSession(sessionId = "default"): BrowserSession {
    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        currentUrl: "about:blank",
        title: "New Tab",
        history: ["about:blank"],
        historyIndex: 0,
        interactiveElements: [],
        pageText: "Blank page. Enter a URL or navigate using browser_navigate.",
        status: "idle",
      };
      sessions.set(sessionId, session);
    }
    return session;
  }

  public static async navigate(sessionId: string, url: string): Promise<BrowserSession> {
    const session = this.getOrCreateSession(sessionId);
    session.status = "loading";

    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = `https://${targetUrl}`;
    }

    try {
      // 1. SSRF protected navigation with redirect revalidation
      let currentUrl = targetUrl;
      let hops = 0;
      let res: Response | null = null;

      while (hops < 5) {
        const u = new URL(currentUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          throw new Error("SSRF Protection: Only HTTP and HTTPS protocols are allowed");
        }
        if (await isResolvedTargetPrivate(u.hostname)) {
          throw new Error(`SSRF Protection: Navigation to private/internal network target (${u.hostname}) is prohibited`);
        }

        res = await fetch(currentUrl, {
          headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
          signal: AbortSignal.timeout(15_000),
          redirect: "manual",
        });

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          if (!location) break;
          currentUrl = new URL(location, currentUrl).toString();
          hops++;
        } else {
          break;
        }
      }

      if (!res || !res.ok) {
        throw new Error(`Navigation failed with HTTP status ${res?.status || "error"}`);
      }

      targetUrl = currentUrl;
      const html = await res.text();

      // Extract page title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      session.title = titleMatch ? titleMatch[1].trim() : targetUrl;
      session.currentUrl = targetUrl;

      // Update history
      if (session.history[session.historyIndex] !== targetUrl) {
        session.history = session.history.slice(0, session.historyIndex + 1);
        session.history.push(targetUrl);
        session.historyIndex = session.history.length - 1;
      }

      // 2. Parse interactive DOM elements
      session.interactiveElements = this.parseInteractiveElements(html, targetUrl);

      // 3. Extract readable visible text
      session.pageText = this.cleanVisibleText(html);
      session.status = "idle";
      session.lastAction = { action: "navigate", value: targetUrl, timestamp: Date.now() };

      return session;
    } catch (err) {
      session.status = "error";
      session.pageText = `Failed to navigate to ${targetUrl}: ${err instanceof Error ? err.message : String(err)}`;
      throw err;
    }
  }

  public static async click(sessionId: string, elementId: number): Promise<BrowserSession> {
    const session = this.getOrCreateSession(sessionId);
    const element = session.interactiveElements.find((e) => e.id === elementId);

    if (!element) {
      throw new Error(`Element #${elementId} not found on page ${session.currentUrl}.`);
    }

    session.lastAction = { action: "click", targetId: elementId, timestamp: Date.now() };

    // If it's a link with href, navigate to it
    if (element.href && (element.tag === "a" || element.href.startsWith("http"))) {
      let resolvedHref = element.href;
      if (resolvedHref.startsWith("/")) {
        try {
          const origin = new URL(session.currentUrl).origin;
          resolvedHref = `${origin}${resolvedHref}`;
        } catch {}
      }
      return this.navigate(sessionId, resolvedHref);
    }

    // If button inside a form, submit
    if (element.tag === "button" || element.inputType === "submit") {
      return this.submit(sessionId, elementId);
    }

    return session;
  }

  public static type(sessionId: string, elementId: number, text: string): BrowserSession {
    const session = this.getOrCreateSession(sessionId);
    const element = session.interactiveElements.find((e) => e.id === elementId);

    if (!element) {
      throw new Error(`Element #${elementId} not found on page ${session.currentUrl}.`);
    }

    element.value = text;
    session.lastAction = { action: "type", targetId: elementId, value: text, timestamp: Date.now() };
    return session;
  }

  public static async submit(sessionId: string, _elementId?: number): Promise<BrowserSession> {
    const session = this.getOrCreateSession(sessionId);
    session.lastAction = { action: "submit", timestamp: Date.now() };

    // Collect all input values on page
    const inputs = session.interactiveElements.filter((e) => e.tag === "input" && e.name && e.value);
    if (inputs.length > 0) {
      // If there's a search input, simulate search navigation
      const searchInput = inputs.find((i) => i.name?.includes("q") || i.name?.includes("search") || i.placeholder?.toLowerCase().includes("search"));
      if (searchInput && searchInput.value) {
        try {
          const origin = new URL(session.currentUrl).origin;
          const searchUrl = `${origin}/search?q=${encodeURIComponent(searchInput.value)}`;
          return this.navigate(sessionId, searchUrl);
        } catch {}
      }
    }

    return session;
  }

  public static async goBack(sessionId: string): Promise<BrowserSession> {
    const session = this.getOrCreateSession(sessionId);
    if (session.historyIndex > 0) {
      session.historyIndex--;
      const prevUrl = session.history[session.historyIndex];
      return this.navigate(sessionId, prevUrl);
    }
    return session;
  }

  public static snapshot(sessionId: string): string {
    const session = this.getOrCreateSession(sessionId);

    const lines: string[] = [
      `Title: ${session.title}`,
      `URL: ${session.currentUrl}`,
      `Status: ${session.status.toUpperCase()}`,
      `--- Interactive Elements (${session.interactiveElements.length}) ---`,
    ];

    for (const el of session.interactiveElements.slice(0, 40)) {
      if (el.tag === "a") {
        lines.push(`[#${el.id}] [Link] "${el.text}" -> ${el.href}`);
      } else if (el.tag === "button") {
        lines.push(`[#${el.id}] [Button] "${el.text}"`);
      } else if (el.tag === "input" || el.tag === "textarea") {
        const valStr = el.value ? ` value="${el.value}"` : "";
        const phStr = el.placeholder ? ` placeholder="${el.placeholder}"` : "";
        lines.push(`[#${el.id}] [Input name="${el.name || "input"}"]${phStr}${valStr}`);
      }
    }

    lines.push("");
    lines.push("--- Visible Page Extract ---");
    lines.push(session.pageText.slice(0, 3000));

    return lines.join("\n");
  }

  public static resetSession(sessionId: string): void {
    sessions.delete(sessionId);
  }

  private static parseInteractiveElements(html: string, baseUrl: string): DomElement[] {
    const elements: DomElement[] = [];
    let currentId = 1;

    // 1. Links <a ...>...</a>
    const linkRegex = /<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null && elements.length < 50) {
      const href = match[1].trim();
      const rawText = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!href || href.startsWith("javascript:") || href === "#") continue;
      if (rawText.length < 2 && !href.includes("http")) continue;

      let resolvedHref = href;
      if (href.startsWith("/")) {
        try {
          const origin = new URL(baseUrl).origin;
          resolvedHref = `${origin}${href}`;
        } catch {}
      }

      elements.push({
        id: currentId++,
        tag: "a",
        text: rawText || href,
        selector: `a[href="${href}"]`,
        href: resolvedHref,
      });
    }

    // 2. Buttons <button ...>...</button>
    const btnRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    while ((match = btnRegex.exec(html)) !== null && elements.length < 75) {
      const rawText = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (rawText) {
        elements.push({
          id: currentId++,
          tag: "button",
          text: rawText,
          selector: `button:has-text("${rawText.slice(0, 20)}")`,
        });
      }
    }

    // 3. Inputs <input ...>
    const inputRegex = /<input\b([^>]*)>/gi;
    while ((match = inputRegex.exec(html)) !== null && elements.length < 100) {
      const attrs = match[1];
      const typeMatch = attrs.match(/type=["']([^"']*)["']/i);
      const nameMatch = attrs.match(/name=["']([^"']*)["']/i);
      const phMatch = attrs.match(/placeholder=["']([^"']*)["']/i);
      const valMatch = attrs.match(/value=["']([^"']*)["']/i);

      const inputType = typeMatch ? typeMatch[1].toLowerCase() : "text";
      if (inputType === "hidden") continue;

      elements.push({
        id: currentId++,
        tag: "input",
        text: phMatch ? phMatch[1] : (nameMatch ? nameMatch[1] : "input"),
        selector: `input[name="${nameMatch ? nameMatch[1] : ""}"]`,
        name: nameMatch ? nameMatch[1] : undefined,
        placeholder: phMatch ? phMatch[1] : undefined,
        value: valMatch ? valMatch[1] : "",
        inputType,
      });
    }

    return elements;
  }

  private static cleanVisibleText(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }
}
