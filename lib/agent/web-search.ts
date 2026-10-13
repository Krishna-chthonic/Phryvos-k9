/**
 * DuckDuckGo web search agent tool helper.
 *
 * Importers/callers: lib/agent/tools.ts (toolWebSearch)
 * Affected API: Agent tool `web_search` in chat SSE stream
 * Data schemas if any: None
 * User instruction verbatim: "5. aur ai ke paas kuch skills plugins bhi hone chahiye jo ki important hai like web search, web fetch, etc."
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function performWebSearch(query: string, limit = 5): Promise<string> {
  const q = query.trim();
  if (!q) return "Search query cannot be empty.";

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return `Search request failed with status ${res.status}.`;
    }

    const html = await res.text();
    const results: SearchResult[] = [];

    // Match each result block in DuckDuckGo HTML
    const resultBlocks = html.split('<div class="result results_links');
    for (let i = 1; i < resultBlocks.length && results.length < limit; i++) {
      const block = resultBlocks[i];

      // Extract title and url
      const titleMatch = block.match(/<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/<a class="result__snippet"[^>]*href="([^"]+)"/i) ||
        block.match(/href="([^"]+)"[^>]*class="result__snippet"/i);

      const linkMatch = block.match(/<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);

      let targetUrl = linkMatch ? linkMatch[1] : titleMatch ? titleMatch[1] : "";
      let title = linkMatch ? linkMatch[2] : "";

      // Decode DDG redirect URL if needed (//duckduckgo.com/l/?uddg=URL)
      if (targetUrl.includes("uddg=")) {
        const decoded = targetUrl.split("uddg=")[1]?.split("&")[0];
        if (decoded) targetUrl = decodeURIComponent(decoded);
      }

      // Extract snippet
      const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
      let snippet = snippetMatch ? snippetMatch[1] : "";

      // Clean HTML tags and entities
      title = cleanHtml(title);
      snippet = cleanHtml(snippet);

      if (title && targetUrl) {
        results.push({
          title,
          url: targetUrl.startsWith("//") ? `https:${targetUrl}` : targetUrl,
          snippet,
        });
      }
    }

    // Fallback if HTML parsing yielded 0 results: try DuckDuckGo instant answer API
    if (results.length === 0) {
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`;
      const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
      if (apiRes.ok) {
        const data = (await apiRes.json()) as {
          AbstractText?: string;
          AbstractURL?: string;
          Heading?: string;
          RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
        };
        if (data.AbstractText && data.AbstractURL) {
          results.push({
            title: data.Heading || q,
            url: data.AbstractURL,
            snippet: data.AbstractText,
          });
        }
        for (const t of data.RelatedTopics ?? []) {
          if (t.Text && t.FirstURL && results.length < limit) {
            results.push({
              title: t.Text.slice(0, 80),
              url: t.FirstURL,
              snippet: t.Text,
            });
          }
        }
      }
    }

    if (results.length === 0) {
      return `No web results found for "${q}".`;
    }

    return results
      .map(
        (r, idx) =>
          `[${idx + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet ? `Snippet: ${r.snippet}` : ""}`,
      )
      .join("\n\n");
  } catch (e) {
    return `Web search error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function cleanHtml(str: string): string {
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
