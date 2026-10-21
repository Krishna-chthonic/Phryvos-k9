/**
 * Webpage content fetcher agent tool helper.
 *
 * Importers/callers: lib/agent/tools.ts (toolWebFetch)
 * Affected API: Agent tool `web_fetch` in chat SSE stream
 * Data schemas if any: None
 * User instruction verbatim: "5. aur ai ke paas kuch skills plugins bhi hone chahiye jo ki important hai like web search, web fetch, etc."
 */

import dns from "node:dns/promises";

function isPrivateOrLocalHost(hostname: string): boolean {
  let host = hostname.toLowerCase().trim();
  // Strip IPv6 brackets if present
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  // Strip IPv4-mapped IPv6 prefix (::ffff:127.0.0.1)
  if (host.startsWith("::ffff:")) {
    host = host.slice(7);
  }

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1"
  ) {
    return true;
  }

  // IPv4 range checks
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = host.match(ipv4Regex);
  if (match) {
    const [, o1, o2] = match.map(Number);
    if (o1 === 10) return true; // 10.0.0.0/8
    if (o1 === 127) return true; // 127.0.0.0/8 loopback
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true; // 172.16.0.0/12
    if (o1 === 192 && o2 === 168) return true; // 192.168.0.0/16
    if (o1 === 169 && o2 === 254) return true; // 169.254.0.0/16 (link-local, cloud metadata)
    if (o1 === 0) return true; // 0.0.0.0/8
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // 100.64.0.0/10 Carrier-grade NAT
  }

  // IPv6 private / link-local checks
  if (
    host === "::1" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc00:") ||
    host.startsWith("fd00:")
  ) {
    return true;
  }

  return false;
}

export async function isResolvedTargetPrivate(hostname: string): Promise<boolean> {
  if (isPrivateOrLocalHost(hostname)) return true;
  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const rec of records) {
      if (isPrivateOrLocalHost(rec.address)) {
        return true;
      }
    }
  } catch {
    // DNS resolution failure will be handled by fetch
  }
  return false;
}

export async function performWebFetch(targetUrl: string, maxChars = 15_000): Promise<string> {
  const url = targetUrl.trim();
  if (!url) return "URL cannot be empty.";
  if (!/^https?:\/\//i.test(url)) {
    return "URL must begin with http:// or https://";
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Security Error: Only http and https protocols are permitted.";
    }

    if (await isResolvedTargetPrivate(parsed.hostname)) {
      return `Security Error: SSRF Protection blocked access to private/internal network target (${parsed.hostname}).`;
    }

    let currentUrl = url;
    let hops = 0;
    let res: Response | null = null;

    while (hops < 5) {
      const u = new URL(currentUrl);
      if (await isResolvedTargetPrivate(u.hostname)) {
        return `Security Error: SSRF Protection blocked redirect to private/internal host (${u.hostname}).`;
      }

      res = await fetch(currentUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(12_000),
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
      return `Failed to fetch URL (HTTP ${res?.status ?? "unknown"} ${res?.statusText ?? ""}).`;
    }

    const contentType = res.headers.get("content-type") || "";
    if (
      !contentType.includes("text/") &&
      !contentType.includes("application/json") &&
      !contentType.includes("application/xhtml") &&
      !contentType.includes("application/xml")
    ) {
      return `Cannot fetch binary content type: ${contentType}.`;
    }

    const raw = await res.text();
    let text = raw;

    if (contentType.includes("text/html") || raw.includes("<html") || raw.includes("<body")) {
      // Extract title
      const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const pageTitle = titleMatch ? cleanText(titleMatch[1]) : "";

      // Remove unwanted elements
      text = text
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
        .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
        .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "");

      // Convert common tags to readable markdown formatting
      text = text
        .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
        .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
        .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
        .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
        .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<hr\s*\/?>/gi, "\n---\n");

      // Strip remaining HTML tags
      text = cleanText(text);

      if (pageTitle) {
        text = `Title: ${pageTitle}\n\n${text}`;
      }
    } else {
      text = text.trim();
    }

    // Limit length to avoid blowing up context window
    const cap = Math.min(maxChars, 25_000);
    if (text.length > cap) {
      return `${text.slice(0, cap)}\n\n… [Content truncated to ${cap} characters from original ${text.length} chars]`;
    }

    return text || "(Webpage content was empty)";
  } catch (e) {
    return `Web fetch error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function cleanText(str: string): string {
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}
