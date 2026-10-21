/**
 * DigUp On-Device Hybrid Semantic + FTS5 Code & Document Search Engine
 * Inspired by ARahim3/DigUp
 * 
 * Provides:
 * 1. Hybrid Search (FTS5 Exact Token Matching + Vector Cosine Embeddings)
 * 2. Reciprocal Rank Fusion (RRF) damping (K=60)
 * 3. Syntax-aware code chunking (TypeScript, Python, JavaScript, SQL, Shell, Markdown)
 * 4. Vault-wide conceptual discovery (find logic by intent rather than exact keyword)
 * 5. Full indexing lifecycle & stats tracking
 */

import type Database from "better-sqlite3";
import { search as vaultSearch, readFile as vaultReadFile, listDir as vaultListDir, getMeta, type VaultCtx } from "@/lib/vault-service";
import { getVaultDb } from "@/lib/dal/vault-dal";
import { searchChunks, upsertFileChunks, getRagStats } from "@/lib/vector/rag";

export interface DigUpSearchResult {
  filePath: string;
  matchType: "hybrid" | "semantic" | "keyword";
  score: number;
  snippet: string;
  language: string;
  tokenCount?: number;
  chunkIndex?: number;
}

export interface DigUpIndexStats {
  totalFiles: number;
  totalChunks: number;
  totalTokens: number;
  lastIndexedAt?: number;
}

/**
 * Detects programming language from file extension
 */
export function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "py":
      return "python";
    case "sql":
      return "sql";
    case "sh":
    case "bash":
      return "shell";
    case "json":
      return "json";
    case "md":
    case "markdown":
      return "markdown";
    case "html":
      return "html";
    case "css":
      return "css";
    default:
      return "text";
  }
}

/**
 * Executes on-device hybrid semantic + FTS5 code search
 */
export async function hybridDigUpSearch(
  ctx: VaultCtx,
  query: string,
  options?: { limit?: number; fileTypes?: string[]; minScore?: number },
): Promise<DigUpSearchResult[]> {
  const limit = options?.limit || 10;
  const K = 60; // Standard RRF constant

  // 1. Track A: FTS5 Exact Keyword Matches
  const ftsHits = vaultSearch(ctx, query);
  const rankedFts: Array<{ filePath: string; snippet: string; rank: number }> = [];

  let rank = 1;
  for (const hit of ftsHits) {
    if (hit.isDir) continue;
    rankedFts.push({
      filePath: hit.path,
      snippet: hit.snippet || `Match in ${hit.name}`,
      rank: rank++,
    });
  }

  // 2. Track B: Vector Cosine Semantic Search
  let semanticHits: Array<{ filePath: string; content: string; score: number; chunkIndex: number; tokenCount: number }> = [];
  try {
    semanticHits = await searchChunks(ctx as any, query, limit * 2);
  } catch (err) {
    console.warn("[DigUp] Semantic search fallback to keyword only:", err);
  }

  // 3. Reciprocal Rank Fusion (RRF) Combination
  const mergedMap = new Map<string, {
    filePath: string;
    snippet: string;
    rrfScore: number;
    hasFts: boolean;
    hasSemantic: boolean;
    tokenCount?: number;
    chunkIndex?: number;
  }>();

  // Accumulate semantic ranks (weight: 1.2)
  semanticHits.forEach((item, idx) => {
    const semRank = idx + 1;
    const key = `${item.filePath}#${item.chunkIndex}`;
    mergedMap.set(key, {
      filePath: item.filePath,
      snippet: item.content,
      rrfScore: 1.2 / (K + semRank),
      hasFts: false,
      hasSemantic: true,
      tokenCount: item.tokenCount,
      chunkIndex: item.chunkIndex,
    });
  });

  // Accumulate FTS ranks (weight: 1.0)
  rankedFts.forEach((item) => {
    const matchingKey = Array.from(mergedMap.keys()).find((k) => k.startsWith(`${item.filePath}#`));
    if (matchingKey) {
      const existing = mergedMap.get(matchingKey)!;
      existing.rrfScore += 1.0 / (K + item.rank);
      existing.hasFts = true;
    } else {
      mergedMap.set(`${item.filePath}#0`, {
        filePath: item.filePath,
        snippet: item.snippet,
        rrfScore: 1.0 / (K + item.rank),
        hasFts: true,
        hasSemantic: false,
      });
    }
  });

  // Sort by highest RRF score
  const sorted = Array.from(mergedMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit);

  // Filter by requested file types if given
  let filtered = sorted;
  if (options?.fileTypes && options.fileTypes.length > 0) {
    filtered = filtered.filter((item) =>
      options.fileTypes!.some((ft) => item.filePath.toLowerCase().endsWith(ft.toLowerCase())),
    );
  }

  return filtered.map((item) => {
    let matchType: DigUpSearchResult["matchType"] = "keyword";
    if (item.hasFts && item.hasSemantic) matchType = "hybrid";
    else if (item.hasSemantic) matchType = "semantic";

    return {
      filePath: item.filePath,
      matchType,
      score: Math.min(1.0, Math.round(item.rrfScore * 1000) / 100),
      snippet: item.snippet.slice(0, 500),
      language: detectLanguage(item.filePath),
      tokenCount: item.tokenCount,
      chunkIndex: item.chunkIndex,
    };
  });
}

/**
 * Indexes a vault directory for fast hybrid semantic code & document search
 */
export async function indexVaultForDigUp(
  ctx: VaultCtx,
  dirPath = "/",
): Promise<{ indexedFiles: number; totalChunks: number }> {
  let indexedFiles = 0;
  let totalChunks = 0;

  const entries = vaultListDir(ctx, dirPath);

  for (const entry of entries) {
    if (entry.isDir) {
      // Recurse into subdirectories (skipping hidden or backup dirs)
      if (!entry.path.includes("/.git") && !entry.path.includes("/node_modules")) {
        const sub = await indexVaultForDigUp(ctx, entry.path);
        indexedFiles += sub.indexedFiles;
        totalChunks += sub.totalChunks;
      }
      continue;
    }

    // Only index text / code / markdown files
    const lang = detectLanguage(entry.path);
    if (lang === "text" && !entry.path.endsWith(".txt")) continue;

    try {
      const text = vaultReadFile(ctx, entry.path).bytes.toString("utf8");
      if (!text || text.length < 10) continue;

      const chunkCount = await upsertFileChunks(ctx as any, entry.path, text);
      if (chunkCount > 0) {
        indexedFiles++;
        totalChunks += chunkCount;
      }
    } catch (err) {
      console.warn(`[DigUp] Failed to index ${entry.path}:`, err);
    }
  }

  return { indexedFiles, totalChunks };
}

/**
 * Retrieves index statistics
 */
export async function getDigUpStats(ctx: VaultCtx): Promise<DigUpIndexStats> {
  const db = getVaultDb(ctx as any);

  const fileCountRow = db.prepare("SELECT COUNT(DISTINCT file_path) as cnt FROM file_chunks").get() as { cnt: number } | undefined;
  const chunkCountRow = db.prepare("SELECT COUNT(*) as cnt, SUM(token_count) as tokens FROM file_chunks").get() as { cnt: number; tokens: number } | undefined;

  return {
    totalFiles: fileCountRow?.cnt || 0,
    totalChunks: chunkCountRow?.cnt || 0,
    totalTokens: chunkCountRow?.tokens || 0,
    lastIndexedAt: Date.now(),
  };
}
