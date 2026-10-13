/**
 * Webpage content fetcher agent tool helper.
 *
 * Importers/callers: lib/agent/tools.ts (toolWebFetch)
 * Affected API: Agent tool `web_fetch` in chat SSE stream
 * Data schemas if any: None
 * User instruction verbatim: "5. aur ai ke paas kuch skills plugins bhi hone chahiye jo ki important hai like web search, web fetch, etc."
 */

export async function performWebFetch(targetUrl: string, maxChars = 15_000): Promise<string> {
  const url = targetUrl.trim();
  if (!url) return "URL cannot be empty.";
  if (!/^https?:\/\//i.test(url)) {
    return "URL must begin with http:// or https://";
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12_000),
      redirect: "follow",
    });

    if (!res.ok) {
      return `Failed to fetch URL (HTTP ${res.status} ${res.statusText}).`;
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
