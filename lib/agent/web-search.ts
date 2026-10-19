/**
 * Multi-tier Web Search Agent Tool for phryvos-k9.
 *
 * Implements resilient web searching across:
 * 1. DuckDuckGo HTML Engine (deep search links & snippets)
 * 2. DuckDuckGo Lite Engine (fallback)
 * 3. DuckDuckGo Instant Answer API (fallback)
 * 4. Wikipedia OpenSearch API (factual grounding fallback)
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function performWebSearch(query: string, limit = 6): Promise<string> {
  const q = query.trim();
  if (!q) return "Search query cannot be empty.";

  const results: SearchResult[] = [];

  // Tier 1: DuckDuckGo HTML search
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const html = await res.text();
      const blocks = html.split(/class="[^"]*result results_links/);
      for (let i = 1; i < blocks.length && results.length < limit; i++) {
        const block = blocks[i];
        const linkMatch =
          block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
          block.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i);

        const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);

        let targetUrl = linkMatch ? linkMatch[1] : "";
        let title = linkMatch ? linkMatch[2] : "";
        let snippet = snippetMatch ? snippetMatch[1] : "";

        if (targetUrl.includes("uddg=")) {
          const decoded = targetUrl.split("uddg=")[1]?.split("&")[0];
          if (decoded) targetUrl = decodeURIComponent(decoded);
        }

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
    }
  } catch {
    // Continue to Tier 2
  }

  // Tier 2: DuckDuckGo Lite search fallback if Tier 1 returned 0 results
  if (results.length === 0) {
    try {
      const res = await fetch("https://lite.duckduckgo.com/lite/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        body: `q=${encodeURIComponent(q)}`,
        signal: AbortSignal.timeout(8_000),
      });

      if (res.ok) {
        const html = await res.text();
        const rows = html.split(/<tr\b[^>]*>/i);
        let currentTitle = "";
        let currentUrl = "";

        for (const row of rows) {
          if (results.length >= limit) break;

          const linkMatch = row.match(/<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
          if (linkMatch) {
            let u = linkMatch[1];
            if (u.includes("uddg=")) {
              const decoded = u.split("uddg=")[1]?.split("&")[0];
              if (decoded) u = decodeURIComponent(decoded);
            }
            currentUrl = u.startsWith("//") ? `https:${u}` : u;
            currentTitle = cleanHtml(linkMatch[2]);
            continue;
          }

          const snippetMatch = row.match(/<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/i);
          if (snippetMatch && currentUrl && currentTitle) {
            results.push({
              title: currentTitle,
              url: currentUrl,
              snippet: cleanHtml(snippetMatch[1]),
            });
            currentTitle = "";
            currentUrl = "";
          }
        }
      }
    } catch {
      // Continue to Tier 3
    }
  }

  // Tier 3: DuckDuckGo Instant Answer API fallback
  if (results.length === 0) {
    try {
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`;
      const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(6000) });
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
    } catch {
      // Continue to Tier 4
    }
  }

  // Tier 4: Wikipedia OpenSearch API fallback
  if (results.length === 0) {
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=5&namespace=0&format=json`;
      const wikiRes = await fetch(wikiUrl, {
        headers: { "User-Agent": "PhryvosVault/1.0 (agent@phryvos.in)" },
        signal: AbortSignal.timeout(6000),
      });
      if (wikiRes.ok) {
        const data = (await wikiRes.json()) as [string, string[], string[], string[]];
        const titles = data[1] ?? [];
        const snippets = data[2] ?? [];
        const urls = data[3] ?? [];
        for (let i = 0; i < titles.length && results.length < limit; i++) {
          if (titles[i] && urls[i]) {
            results.push({
              title: titles[i],
              url: urls[i],
              snippet: snippets[i] || `Wikipedia article for ${titles[i]}`,
            });
          }
        }
      }
    } catch {
      // Ignore
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
}

function cleanHtml(str: string): string {
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
