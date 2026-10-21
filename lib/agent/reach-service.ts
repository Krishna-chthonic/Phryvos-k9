/**
 * Agent-Reach Multi-Channel Public Web Intelligence Engine for Phryvos-K9
 * Inspired by Panniantong/Agent-Reach
 * 
 * Provides zero-key, zero-fee access to public web data across 6+ channels:
 * 1. Clean Markdown Web Reader (Jina Reader r.jina.ai + fallback)
 * 2. GitHub Repository, README & Issue Inspector
 * 3. Reddit Discussion & Top Comments Thread Reader
 * 4. YouTube Video Transcript & Metadata Extractor
 * 5. Twitter / X Public Tweet & Thread Viewer (fxtwitter / vxtwitter)
 * 6. RSS / Atom Feed Aggregator
 * 7. Agent Reach Doctor (diagnostic health check)
 */

export interface ReachDoctorReport {
  timestamp: number;
  channels: Array<{
    name: string;
    channel: "web" | "github" | "reddit" | "youtube" | "twitter" | "rss";
    status: "healthy" | "degraded" | "offline";
    latencyMs: number;
    detail?: string;
  }>;
  allHealthy: boolean;
}

export interface ReachWebResult {
  url: string;
  title: string;
  markdown: string;
  length: number;
  source: "jina" | "direct";
}

export interface ReachGithubResult {
  repo: string;
  title?: string;
  description?: string;
  stars?: number;
  forks?: number;
  readme?: string;
  files?: string[];
  issues?: Array<{ title: string; number: number; state: string; url: string }>;
}

export interface ReachRedditResult {
  subreddit: string;
  title: string;
  author: string;
  score: number;
  selftext: string;
  url: string;
  comments: Array<{ author: string; score: number; body: string }>;
}

export interface ReachYouTubeResult {
  videoId: string;
  title: string;
  author: string;
  transcript: string;
  timedCaptionsCount: number;
}

export interface ReachTweetResult {
  id: string;
  text: string;
  authorName: string;
  authorScreenName: string;
  likes: number;
  retweets: number;
  replies: number;
  date: string;
  mediaUrls: string[];
}

export interface ReachRssResult {
  title: string;
  link: string;
  description?: string;
  items: Array<{
    title: string;
    link: string;
    pubDate?: string;
    snippet?: string;
  }>;
}

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Channel 1: Clean Markdown Web Reader
 */
export async function reachWeb(url: string, maxChars = 20_000): Promise<ReachWebResult> {
  const cleanUrl = url.trim();

  // Try Jina Reader first (converts HTML to clean Markdown)
  try {
    const jinaRes = await fetch(`https://r.jina.ai/${cleanUrl}`, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/markdown, text/plain",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (jinaRes.ok) {
      const text = await jinaRes.text();
      if (text.length > 50) {
        // Extract title if present
        const titleMatch = text.match(/^Title:\s*(.+)$/m) || text.match(/^#\s*(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : cleanUrl;
        return {
          url: cleanUrl,
          title,
          markdown: text.slice(0, maxChars),
          length: text.length,
          source: "jina",
        };
      }
    }
  } catch {}

  // Direct fetch fallback
  const directRes = await fetch(cleanUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12_000),
  });

  const rawHtml = await directRes.text();

  // Basic HTML to clean text
  const cleanText = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : cleanUrl;

  return {
    url: cleanUrl,
    title,
    markdown: cleanText.slice(0, maxChars),
    length: cleanText.length,
    source: "direct",
  };
}

/**
 * Channel 2: GitHub Repository & Issue Fetcher
 */
export async function reachGithub(target: string): Promise<ReachGithubResult> {
  // Normalize target: "owner/repo" or "https://github.com/owner/repo"
  let owner = "";
  let repo = "";

  const match = target.match(/(?:github\.com\/|^)([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (match) {
    owner = match[1];
    repo = match[2].replace(/\.git$/, "");
  } else {
    throw new Error(`Invalid GitHub repository format: "${target}". Expected "owner/repo".`);
  }

  // 1. Repo info from public API
  let repoData: any = {};
  try {
    const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github.v3+json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (apiRes.ok) {
      repoData = await apiRes.json();
    }
  } catch {}

  // 2. Fetch README.md
  let readme = "";
  const branches = ["main", "master"];
  for (const b of branches) {
    try {
      const rmRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${b}/README.md`, {
        signal: AbortSignal.timeout(6_000),
      });
      if (rmRes.ok) {
        readme = await rmRes.text();
        break;
      }
    } catch {}
  }

  // 3. Fetch recent open issues
  const issues: Array<{ title: string; number: number; state: string; url: string }> = [];
  try {
    const issuesRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?per_page=5`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github.v3+json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (issuesRes.ok) {
      const data = await issuesRes.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          if (!item.pull_request) {
            issues.push({
              title: item.title,
              number: item.number,
              state: item.state,
              url: item.html_url,
            });
          }
        }
      }
    }
  } catch {}

  return {
    repo: `${owner}/${repo}`,
    title: repoData.name || repo,
    description: repoData.description || "",
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    readme: readme.slice(0, 15_000),
    issues,
  };
}

/**
 * Channel 3: Reddit Discussion & Comment Thread Reader
 */
export async function reachReddit(urlOrSubreddit: string): Promise<ReachRedditResult> {
  let targetUrl = urlOrSubreddit.trim();

  if (targetUrl.startsWith("r/") || !targetUrl.includes("http")) {
    const sub = targetUrl.replace(/^r\//, "").replace(/\/$/, "");
    targetUrl = `https://www.reddit.com/r/${sub}/hot.json?limit=5`;
  } else {
    // Append .json to thread URL if not present
    if (!targetUrl.endsWith(".json")) {
      targetUrl = targetUrl.replace(/\/$/, "") + ".json";
    }
  }

  const res = await fetch(targetUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PhryvosReach/1.0)" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Reddit request failed with status: ${res.status}`);
  }

  const json = await res.json();
  const isListing = Array.isArray(json) ? false : !!json.data?.children;

  if (isListing) {
    // Subreddit listing
    const posts = json.data.children;
    const first = posts[0]?.data;
    if (!first) throw new Error("No posts found in subreddit.");

    return {
      subreddit: first.subreddit || "reddit",
      title: first.title,
      author: first.author,
      score: first.score,
      selftext: first.selftext || "(Link post: " + first.url + ")",
      url: `https://reddit.com${first.permalink}`,
      comments: posts.slice(1, 5).map((p: any) => ({
        author: p.data?.author || "anonymous",
        score: p.data?.score || 0,
        body: p.data?.title || "",
      })),
    };
  }

  // Single post with comments (Array of [postData, commentsData])
  const postData = json[0]?.data?.children[0]?.data;
  const commentsData = json[1]?.data?.children || [];

  if (!postData) throw new Error("Unable to parse Reddit post.");

  const topComments = commentsData
    .filter((c: any) => c.kind === "t1" && c.data?.body)
    .slice(0, 8)
    .map((c: any) => ({
      author: c.data.author,
      score: c.data.score,
      body: c.data.body,
    }));

  return {
    subreddit: postData.subreddit,
    title: postData.title,
    author: postData.author,
    score: postData.score,
    selftext: postData.selftext || "",
    url: `https://reddit.com${postData.permalink}`,
    comments: topComments,
  };
}

/**
 * Channel 4: YouTube Transcript & Video Metadata Extractor
 */
export async function reachYouTube(videoIdOrUrl: string): Promise<ReachYouTubeResult> {
  let videoId = videoIdOrUrl.trim();
  const idMatch = videoId.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  if (idMatch) {
    videoId = idMatch[1];
  }

  // 1. Fetch title & author from YouTube public oEmbed
  let title = `YouTube Video (${videoId})`;
  let author = "YouTube Creator";

  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (oembedRes.ok) {
      const data = await oembedRes.json();
      title = data.title || title;
      author = data.author_name || author;
    }
  } catch {}

  // 2. Extract transcript using YouTube timedtext public XML
  let transcript = "";
  let timedCaptionsCount = 0;

  try {
    // Fetch video watch page to locate timedtext caption tracks
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(10_000),
    });

    if (pageRes.ok) {
      const html = await pageRes.text();
      const matchTracks = html.match(/"captionTracks":\s*(\[.*?\])/);
      if (matchTracks) {
        const tracks = JSON.parse(matchTracks[1]);
        const enTrack = tracks.find((t: any) => t.languageCode === "en") || tracks[0];

        if (enTrack?.baseUrl) {
          const subRes = await fetch(enTrack.baseUrl, { signal: AbortSignal.timeout(6_000) });
          if (subRes.ok) {
            const subXml = await subRes.text();
            // Parse XML text blocks
            const regex = /<text[^>]*>([\s\S]*?)<\/text>/g;
            const segments: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = regex.exec(subXml)) !== null) {
              const decoded = m[1]
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .trim();
              if (decoded) segments.push(decoded);
            }

            timedCaptionsCount = segments.length;
            transcript = segments.join(" ");
          }
        }
      }
    }
  } catch {}

  if (!transcript) {
    transcript = `(Timed transcript could not be automatically extracted; captions may be disabled on this video.)`;
  }

  return {
    videoId,
    title,
    author,
    transcript: transcript.slice(0, 25_000),
    timedCaptionsCount,
  };
}

/**
 * Channel 5: Twitter / X Public Post Viewer
 */
export async function reachTweet(urlOrId: string): Promise<ReachTweetResult> {
  const match = urlOrId.match(/(?:status\/|^)(\d+)/);
  const tweetId = match ? match[1] : urlOrId.trim();

  // Query public fxtwitter / api.vxtwitter endpoint
  const res = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Tweet fetch failed with status: ${res.status}`);
  }

  const json = await res.json();
  const t = json.tweet;
  if (!t) throw new Error("Could not parse tweet response.");

  const mediaUrls: string[] = [];
  if (t.media?.all) {
    for (const m of t.media.all) {
      if (m.url) mediaUrls.push(m.url);
    }
  }

  return {
    id: t.id,
    text: t.text,
    authorName: t.author?.name || "Unknown",
    authorScreenName: t.author?.screen_name || "unknown",
    likes: t.likes || 0,
    retweets: t.retweets || 0,
    replies: t.replies || 0,
    date: t.created_at || new Date().toISOString(),
    mediaUrls,
  };
}

/**
 * Channel 6: RSS / Atom Feed Aggregator
 */
export async function reachRss(feedUrl: string, maxItems = 6): Promise<ReachRssResult> {
  const res = await fetch(feedUrl.trim(), {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`RSS feed fetch failed with status: ${res.status}`);
  }

  const xml = await res.text();

  // Extract feed title
  const feedTitleMatch = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const feedTitle = feedTitleMatch ? feedTitleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim() : feedUrl;

  const items: ReachRssResult["items"] = [];
  const itemRegex = /<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
    const block = match[0];
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link[^>]*href=["'](.*?)["']/i) || block.match(/<link[^>]*>(.*?)<\/link>/i);
    const dateMatch = block.match(/<(?:pubDate|published|updated)[^>]*>(.*?)<\//i);
    const descMatch = block.match(/<(?:description|summary|content)[^>]*>([\s\S]*?)<\//i);

    const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim() : "Untitled";
    const link = linkMatch ? linkMatch[1].trim() : "";
    const pubDate = dateMatch ? dateMatch[1].trim() : undefined;
    const snippet = descMatch
      ? descMatch[1]
          .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200)
      : undefined;

    items.push({ title, link, pubDate, snippet });
  }

  return {
    title: feedTitle,
    link: feedUrl,
    items,
  };
}

/**
 * Channel 7: The "Agent Reach Doctor"
 * Runs diagnostic checks across all reach channels and returns health & latency metrics
 */
export async function runAgentReachDoctor(): Promise<ReachDoctorReport> {
  const channels: ReachDoctorReport["channels"] = [];

  // 1. Web
  const startWeb = Date.now();
  try {
    const res = await reachWeb("https://example.com", 200);
    channels.push({
      name: "Clean Web Reader (Jina / Direct)",
      channel: "web",
      status: res.markdown.length > 20 ? "healthy" : "degraded",
      latencyMs: Date.now() - startWeb,
      detail: `Fetched ${res.source} mode`,
    });
  } catch (err) {
    channels.push({
      name: "Clean Web Reader (Jina / Direct)",
      channel: "web",
      status: "offline",
      latencyMs: Date.now() - startWeb,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. GitHub
  const startGh = Date.now();
  try {
    const res = await reachGithub("octocat/Hello-World");
    channels.push({
      name: "GitHub Public Inspector",
      channel: "github",
      status: res.readme ? "healthy" : "degraded",
      latencyMs: Date.now() - startGh,
      detail: `Stars: ${res.stars ?? 0}`,
    });
  } catch (err) {
    channels.push({
      name: "GitHub Public Inspector",
      channel: "github",
      status: "offline",
      latencyMs: Date.now() - startGh,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. Reddit
  const startRed = Date.now();
  try {
    const res = await reachReddit("r/technology");
    channels.push({
      name: "Reddit Public JSON Extractor",
      channel: "reddit",
      status: res.title ? "healthy" : "degraded",
      latencyMs: Date.now() - startRed,
      detail: `Subreddit: r/${res.subreddit}`,
    });
  } catch (err) {
    channels.push({
      name: "Reddit Public JSON Extractor",
      channel: "reddit",
      status: "offline",
      latencyMs: Date.now() - startRed,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. YouTube
  const startYt = Date.now();
  try {
    const res = await reachYouTube("dQw4w9WgXcQ");
    channels.push({
      name: "YouTube Metadata & Transcript",
      channel: "youtube",
      status: res.title ? "healthy" : "degraded",
      latencyMs: Date.now() - startYt,
      detail: res.title,
    });
  } catch (err) {
    channels.push({
      name: "YouTube Metadata & Transcript",
      channel: "youtube",
      status: "offline",
      latencyMs: Date.now() - startYt,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // 5. Twitter / X
  const startTw = Date.now();
  try {
    const res = await reachTweet("20");
    channels.push({
      name: "Twitter / X Post Mirror",
      channel: "twitter",
      status: res.text ? "healthy" : "degraded",
      latencyMs: Date.now() - startTw,
      detail: `@${res.authorScreenName}`,
    });
  } catch (err) {
    channels.push({
      name: "Twitter / X Post Mirror",
      channel: "twitter",
      status: "offline",
      latencyMs: Date.now() - startTw,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // 6. RSS
  const startRss = Date.now();
  try {
    const res = await reachRss("https://news.ycombinator.com/rss", 2);
    channels.push({
      name: "RSS / Atom Feed Parser",
      channel: "rss",
      status: res.items.length > 0 ? "healthy" : "degraded",
      latencyMs: Date.now() - startRss,
      detail: `${res.items.length} items parsed`,
    });
  } catch (err) {
    channels.push({
      name: "RSS / Atom Feed Parser",
      channel: "rss",
      status: "offline",
      latencyMs: Date.now() - startRss,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const allHealthy = channels.every((c) => c.status === "healthy" || c.status === "degraded");

  return {
    timestamp: Date.now(),
    channels,
    allHealthy,
  };
}
