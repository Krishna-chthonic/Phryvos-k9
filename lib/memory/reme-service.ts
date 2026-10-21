/**
 * ReMe (Remember Me, Refine Me) Memory Engine for Phryvos-K9
 * Inspired by AgentScope / QwenPaw
 * 
 * Implements:
 * 1. Three-Layer Memory Architecture (Context -> Verbatim Logs -> Vault Markdown Knowledge)
 * 2. File-as-Memory: Durable memories stored as encrypted Markdown with YAML frontmatter & [[wikilinks]]
 * 3. Hybrid RRF (Reciprocal Rank Fusion) precision recall (BM25 + Semantic Embeddings + Link Expansion)
 * 4. Auto-Dream Consolidation Cycle (converts episodic interactions into permanent structured knowledge)
 * 5. Mobile & Telegram ASCII Table Formatter
 */

import type Database from "better-sqlite3";
import { createFile, writeFile, readFile, getMeta, listDir, search, type VaultCtx } from "@/lib/vault-service";
import { generateEmbeddings, cosineSimilarity, chunkText } from "@/lib/vector/embeddings";
import { extractWikiLinks } from "@/lib/vault-links";
import { getAllSTM, storeSTM } from "@/lib/memory/consolidation";

export interface ReMeMemoryDoc {
  title: string;
  category: string;
  tags: string[];
  content: string;
  source?: string;
  confidence: number;
  wikilinks: string[];
  createdAt: number;
  updatedAt: number;
  vaultPath: string;
}

export interface ReMeSearchResult {
  title: string;
  category: string;
  content: string;
  vaultPath: string;
  score: number;
  matchType: "fts" | "semantic" | "graph" | "hybrid";
  wikilinks: string[];
}

/**
 * Parses YAML frontmatter from a Markdown memory file
 */
export function parseFrontmatter(markdown: string): { frontmatter: Record<string, any>; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: markdown };
  }

  const rawYaml = match[1];
  const body = match[2];
  const frontmatter: Record<string, any> = {};

  for (const line of rawYaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).trim();
      let val = line.substring(colonIdx + 1).trim();
      // Parse basic types
      if (val.startsWith("[") && val.endsWith("]")) {
        try {
          frontmatter[key] = JSON.parse(val);
        } catch {
          frontmatter[key] = val.slice(1, -1).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
        }
      } else if (val.startsWith('"') && val.endsWith('"')) {
        frontmatter[key] = val.slice(1, -1);
      } else if (!isNaN(Number(val)) && val !== "") {
        frontmatter[key] = Number(val);
      } else {
        frontmatter[key] = val;
      }
    }
  }

  return { frontmatter, body };
}

/**
 * Serializes a memory document into standard ReMe Markdown with frontmatter
 */
export function serializeMemoryDoc(doc: Omit<ReMeMemoryDoc, "vaultPath">): string {
  const frontmatterLines = [
    "---",
    `title: "${doc.title.replace(/"/g, '\\"')}"`,
    `category: "${doc.category}"`,
    `tags: ${JSON.stringify(doc.tags)}`,
    `source: "${doc.source || "user"}"`,
    `confidence: ${doc.confidence}`,
    `wikilinks: ${JSON.stringify(doc.wikilinks)}`,
    `created_at: ${doc.createdAt}`,
    `updated_at: ${doc.updatedAt}`,
    "---",
    "",
    `# ${doc.title}`,
    "",
    doc.content.trim(),
    "",
  ];

  return frontmatterLines.join("\n");
}

/**
 * Stores or updates a durable Markdown memory file in the encrypted vault
 */
export async function storeReMeMemory(
  ctx: VaultCtx,
  input: {
    title: string;
    content: string;
    category?: string;
    tags?: string[];
    source?: string;
    confidence?: number;
    relatedTopics?: string[];
  },
): Promise<ReMeMemoryDoc> {
  const category = (input.category || "general").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const slug = input.title.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 50);
  const vaultPath = `/memories/${category}/${slug}.md`;

  const extractedLinks = extractWikiLinks(input.content).map((l) => `[[${l.target}]]`);
  const allLinks = Array.from(new Set([...extractedLinks, ...(input.relatedTopics || [])]));

  const now = Date.now();
  const existingMeta = getMeta(ctx, vaultPath);

  let createdAt = now;
  if (existingMeta && !existingMeta.deletedAt) {
    try {
      const existingText = readFile(ctx, vaultPath).bytes.toString("utf8");
      const { frontmatter } = parseFrontmatter(existingText);
      if (frontmatter.created_at) createdAt = Number(frontmatter.created_at);
    } catch {}
  } else {
    createFile(ctx, vaultPath);
  }

  const doc: ReMeMemoryDoc = {
    title: input.title,
    category,
    tags: input.tags || [category],
    content: input.content,
    source: input.source || "user",
    confidence: input.confidence ?? 1.0,
    wikilinks: allLinks,
    createdAt,
    updatedAt: now,
    vaultPath,
  };

  const serialized = serializeMemoryDoc(doc);
  writeFile(ctx, vaultPath, serialized);

  return doc;
}

/**
 * Hybrid RRF (Reciprocal Rank Fusion) precision recall over ReMe memories
 */
export async function recallReMeMemories(
  ctx: VaultCtx,
  query: string,
  limit = 5,
): Promise<ReMeSearchResult[]> {
  const queryLower = query.toLowerCase();

  // 1. Gather all files in /memories/
  const memoryMetas = search(ctx, "memories/");
  const docs: ReMeMemoryDoc[] = [];

  for (const hit of memoryMetas) {
    if (hit.isDir || !hit.path.endsWith(".md")) continue;
    const meta = getMeta(ctx, hit.path);
    if (!meta || meta.deletedAt) continue;
    try {
      const raw = readFile(ctx, hit.path).bytes.toString("utf8");
      const { frontmatter, body } = parseFrontmatter(raw);
      docs.push({
        title: frontmatter.title || hit.name.replace(".md", ""),
        category: frontmatter.category || "general",
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        content: body.trim(),
        source: frontmatter.source,
        confidence: frontmatter.confidence ?? 1.0,
        wikilinks: Array.isArray(frontmatter.wikilinks) ? frontmatter.wikilinks : [],
        createdAt: Number(frontmatter.created_at) || meta.createdAt,
        updatedAt: Number(frontmatter.updated_at) || meta.updatedAt,
        vaultPath: hit.path,
      });
    } catch {}
  }

  if (docs.length === 0) {
    return [];
  }

  // 2. Track A: BM25 / Keyword Rank
  const keywordScores = docs.map((doc) => {
    let score = 0;
    const docText = `${doc.title} ${doc.category} ${doc.tags.join(" ")} ${doc.content}`.toLowerCase();
    const queryTokens = queryLower.split(/\s+/).filter(Boolean);

    for (const token of queryTokens) {
      if (doc.title.toLowerCase().includes(token)) score += 5;
      if (doc.tags.some((t) => t.toLowerCase().includes(token))) score += 3;
      if (docText.includes(token)) score += 1;
    }
    return score;
  });

  const rankedKeyword = docs
    .map((doc, idx) => ({ doc, score: keywordScores[idx] }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  // 3. Track B: Semantic Vector Rank
  let queryEmbedding: Float32Array | null = null;
  try {
    const qChunks = chunkText(query, 512, 0);
    const [embRes] = await generateEmbeddings(ctx, qChunks);
    if (embRes) {
      queryEmbedding = embRes.embedding;
    }
  } catch {}

  let rankedSemantic: Array<{ doc: ReMeMemoryDoc; score: number }> = [];
  if (queryEmbedding) {
    const semanticScores: Array<{ doc: ReMeMemoryDoc; score: number }> = [];
    for (const doc of docs) {
      try {
        const docChunks = chunkText(`${doc.title}: ${doc.content.slice(0, 300)}`, 512, 0);
        const [docEmbRes] = await generateEmbeddings(ctx, docChunks);
        if (docEmbRes?.embedding) {
          const sim = cosineSimilarity(queryEmbedding, docEmbRes.embedding);
          semanticScores.push({ doc, score: sim });
        } else {
          semanticScores.push({ doc, score: 0 });
        }
      } catch {
        semanticScores.push({ doc, score: 0 });
      }
    }
    rankedSemantic = semanticScores.filter((s) => s.score > 0.4).sort((a, b) => b.score - a.score);
  }

  // 4. Track C: Wikilink Graph Expansion
  const matchedTitles = new Set(rankedKeyword.slice(0, 3).map((r) => r.doc.title.toLowerCase()));
  const graphLinkedDocs = docs.filter((d) =>
    d.wikilinks.some((link) => {
      const clean = link.replace(/^\[\[|\]\]$/g, "").toLowerCase();
      return matchedTitles.has(clean);
    }),
  );

  // 5. Reciprocal Rank Fusion (RRF) Combination
  const rrfScores = new Map<string, { doc: ReMeMemoryDoc; rrfScore: number }>();
  const K = 60; // Standard RRF damping factor

  // Accumulate keyword ranks
  rankedKeyword.forEach((item, rank) => {
    const current = rrfScores.get(item.doc.vaultPath) || { doc: item.doc, rrfScore: 0 };
    current.rrfScore += 1 / (K + rank + 1);
    rrfScores.set(item.doc.vaultPath, current);
  });

  // Accumulate semantic ranks
  rankedSemantic.forEach((item, rank) => {
    const current = rrfScores.get(item.doc.vaultPath) || { doc: item.doc, rrfScore: 0 };
    current.rrfScore += 1.2 / (K + rank + 1); // Slight weight boost for semantic
    rrfScores.set(item.doc.vaultPath, current);
  });

  // Accumulate graph expansion boost
  graphLinkedDocs.forEach((doc, rank) => {
    const current = rrfScores.get(doc.vaultPath) || { doc, rrfScore: 0 };
    current.rrfScore += 0.8 / (K + rank + 1);
    rrfScores.set(doc.vaultPath, current);
  });

  // Sort and build final results
  const sorted = Array.from(rrfScores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit);

  return sorted.map(({ doc, rrfScore }) => ({
    title: doc.title,
    category: doc.category,
    content: doc.content,
    vaultPath: doc.vaultPath,
    score: Math.min(1.0, Math.round(rrfScore * 100) / 10),
    matchType: "hybrid",
    wikilinks: doc.wikilinks,
  }));
}

/**
 * Autonomous Dream & Memory Consolidation Cycle
 * Periodic pass converting short-term interactions into permanent ReMe Markdown files
 */
export async function runReMeDreamCycle(
  ctx: VaultCtx,
): Promise<{ consolidated: number; newFiles: string[] }> {
  const newFiles: string[] = [];
  let consolidatedCount = 0;

  try {
    // 1. Fetch un-promoted Short-Term Memories
    const stmRecords = await getAllSTM(ctx as any);
    const unpromoted = stmRecords.filter((r) => !r.ltmPromoted && r.stmAccessCount >= 2);

    for (const record of unpromoted) {
      try {
        let parsedVal: { fact?: string; context?: string; source?: string } = {};
        try {
          parsedVal = JSON.parse(record.stmValue);
        } catch {
          parsedVal = { fact: record.stmValue };
        }

        const factText = parsedVal.fact || record.stmKey;
        const category = record.ltmCategory || "facts";
        const title = record.stmKey.length < 35 ? record.stmKey : `${record.stmKey.slice(0, 30)}...`;

        const saved = await storeReMeMemory(ctx, {
          title,
          content: `${factText}\n\n*Context:* ${parsedVal.context || "Autonomous consolidation"}\n*Access count:* ${record.stmAccessCount}`,
          category,
          tags: ["dream-consolidated", category],
          source: parsedVal.source || "auto-dream",
          confidence: 0.9,
        });

        newFiles.push(saved.vaultPath);
        consolidatedCount++;
      } catch (err) {
        console.error("[ReMe Dream] Failed to consolidate record:", err);
      }
    }
  } catch (err) {
    console.error("[ReMe Dream] Cycle error:", err);
  }

  return { consolidated: consolidatedCount, newFiles };
}

/**
 * Mobile-Optimized Table Formatter (QwenPaw Standard)
 * Converts markdown tables to clean monospace ASCII tables for Telegram/mobile screens
 */
export function formatMarkdownTablesForMobile(text: string): string {
  if (!text.includes("|") || !text.includes("-|-")) return text;

  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check if line looks like table header
    if (line.trim().startsWith("|") && lines[i + 1]?.includes("-|-")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }

      if (tableLines.length >= 2) {
        const header = tableLines[0].split("|").map((c) => c.trim()).filter(Boolean);
        const rows = tableLines.slice(2).map((l) => l.split("|").map((c) => c.trim()).filter(Boolean));

        // Format into mobile-friendly key-value blocks
        let formatted = "```\n";
        rows.forEach((row, rowIdx) => {
          formatted += `[#${rowIdx + 1}]\n`;
          header.forEach((h, colIdx) => {
            const val = row[colIdx] || "-";
            formatted += `• ${h}: ${val}\n`;
          });
          formatted += "\n";
        });
        formatted += "```";
        result.push(formatted.trim());
        continue;
      }
    }

    result.push(line);
    i++;
  }

  return result.join("\n");
}
