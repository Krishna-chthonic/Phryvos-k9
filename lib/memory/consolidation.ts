/**
 * Sleep-Consolidation Memory Engine — two-tier STM → LTM with decay/deduplication
 * Short-term scratchpad promotes to permanent memories after repeated access
 *
 * Importers: lib/agent/tools.ts (storeSTM, recallSTM, runConsolidationJob)
 * Affected API: STM/LTM memory operations
 * Data schemas: memory_consolidation, memories tables (lib/db/schema.ts)
 */

import { type VaultCtx, getVaultDb } from "@/lib/dal/vault-dal";
import { generateEmbeddings, cosineSimilarity } from "@/lib/vector/embeddings";

export interface STMRecord {
  id: number;
  stmKey: string;
  stmValue: string; // JSON: { fact, context, source, confidence }
  stmAccessCount: number;
  stmLastAccess: number;
  ltmPromoted: boolean;
  ltmPoint?: string;
  ltmCategory?: string;
  decayScore: number;
  createdAt: number;
  updatedAt: number;
}

export interface LTMRecord {
  id: number;
  point: string;
  category: string;
  createdAt: number;
  updatedAt: number;
}

const DECAY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PROMOTION_THRESHOLD = 0.3; // decay_score below this triggers review
const PROMOTION_MIN_ACCESS = 3; // minimum accesses before promotion consideration
const DELETION_THRESHOLD = 0.1; // decay_score below this with low access → delete

/**
 * Calculate decay score based on time since last access
 */
export function calculateDecayScore(lastAccess: number, now = Date.now()): number {
  const age = now - lastAccess;
  return Math.max(0, 1 - age / DECAY_HALF_LIFE_MS);
}

/**
 * Store a fact in short-term memory
 */
export async function storeSTM(
  ctx: VaultCtx,
  key: string,
  fact: string,
  context: string,
  source: string = "chat",
  confidence: number = 1.0
): Promise<void> {
  const db = getVaultDb(ctx);
  const now = Date.now();

  const value = JSON.stringify({ fact, context, source, confidence });

  db.prepare(`
    INSERT INTO memory_consolidation (stm_key, stm_value, stm_access_count, stm_last_access, ltm_promoted, decay_score, created_at, updated_at)
    VALUES (?, ?, 1, ?, 0, 1.0, ?, ?)
    ON CONFLICT(stm_key) DO UPDATE SET
      stm_value = excluded.stm_value,
      stm_access_count = stm_access_count + 1,
      stm_last_access = excluded.stm_last_access,
      decay_score = 1.0,
      updated_at = excluded.updated_at
  `).run(key, value, now, now, now);
}

/**
 * Recall a fact from STM (increments access count, updates last access)
 */
export async function recallSTM(ctx: VaultCtx, key: string): Promise<STMRecord | null> {
  const db = getVaultDb(ctx);
  const now = Date.now();

  const row = db.prepare("SELECT * FROM memory_consolidation WHERE stm_key = ?").get(key) as STMRecord | undefined;

  if (!row) return null;

  // Update access count and last access
  db.prepare(`
    UPDATE memory_consolidation
    SET stm_access_count = stm_access_count + 1, stm_last_access = ?, decay_score = 1.0, updated_at = ?
    WHERE stm_key = ?
  `).run(now, now, key);

  return { ...row, stmAccessCount: row.stmAccessCount + 1, stmLastAccess: now, decayScore: 1.0 };
}

/**
 * Get all STM records
 */
export async function getAllSTM(ctx: VaultCtx): Promise<STMRecord[]> {
  const db = getVaultDb(ctx);
  return db.prepare(`
    SELECT * FROM memory_consolidation WHERE ltm_promoted = 0 ORDER BY stm_last_access DESC
  `).all() as STMRecord[];
}

/**
 * Get STM records needing consolidation (low decay, not promoted)
 */
export async function getCandidatesForConsolidation(ctx: VaultCtx): Promise<STMRecord[]> {
  const db = getVaultDb(ctx);
  return db.prepare(`
    SELECT * FROM memory_consolidation
    WHERE ltm_promoted = 0 AND decay_score < ?
    ORDER BY decay_score
  `).all(PROMOTION_THRESHOLD) as STMRecord[];
}

/**
 * Cluster STM records by semantic similarity
 */
export async function clusterSTM(
  ctx: VaultCtx,
  records: STMRecord[],
  similarityThreshold = 0.85
): Promise<STMRecord[][]> {
  if (records.length === 0) return [];

  // Generate embeddings for all facts
  const chunks = records.map((r) => {
    const parsed = JSON.parse(r.stmValue);
    return {
      filePath: r.stmKey,
      chunkIndex: 0,
      content: parsed.fact,
      tokenCount: parsed.fact.length / 4,
    };
  });

  const embeddings = await generateEmbeddings(ctx, chunks);

  // Simple greedy clustering
  const clusters: STMRecord[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < records.length; i++) {
    if (used.has(i)) continue;

    const cluster = [records[i]];
    used.add(i);

    for (let j = i + 1; j < records.length; j++) {
      if (used.has(j)) continue;

      const sim = cosineSimilarity(embeddings[i].embedding, embeddings[j].embedding);
      if (sim >= similarityThreshold) {
        cluster.push(records[j]);
        used.add(j);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Synthesize a cluster into a single LTM point using a fast model
 */
async function synthesizeCluster(ctx: VaultCtx, cluster: STMRecord[]): Promise<{ point: string; category: string }> {
  // For now, use a simple heuristic synthesis
  // In production, this would call a fast LLM
  const facts = cluster.map((r) => {
    const parsed = JSON.parse(r.stmValue);
    return parsed.fact;
  });

  const category = cluster[0] ? JSON.parse(cluster[0].stmValue).source : "fact";

  // Simple concatenation for now
  const point = facts.length === 1
    ? facts[0]
    : facts.slice(0, 3).join("; ") + (facts.length > 3 ? ` (+${facts.length - 3} more)` : "");

  return { point, category };
}

/**
 * Promote STM cluster to LTM
 */
export async function promoteToLTM(
  ctx: VaultCtx,
  cluster: STMRecord[],
  synthesis: { point: string; category: string }
): Promise<number> {
  const db = getVaultDb(ctx);
  const now = Date.now();

  // Insert into memories table
  const result = db.prepare(`
    INSERT INTO memories (point, category, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(synthesis.point, synthesis.category, now, now);

  const ltmId = result.lastInsertRowid as number;

  // Update STM records as promoted
  const updateStmt = db.prepare(`
    UPDATE memory_consolidation
    SET ltm_promoted = 1, ltm_point = ?, ltm_category = ?, updated_at = ?
    WHERE id = ?
  `);
  for (const record of cluster) {
    updateStmt.run(synthesis.point, synthesis.category, now, record.id);
  }

  return ltmId;
}

/**
 * Delete old, unaccessed STM records
 */
export async function cleanupSTM(ctx: VaultCtx): Promise<number> {
  const db = getVaultDb(ctx);
  const now = Date.now();

  const result = db.prepare(`
    DELETE FROM memory_consolidation
    WHERE ltm_promoted = 0 AND decay_score < ? AND stm_access_count < 2
  `).run(DELETION_THRESHOLD);

  return result.changes;
}

/**
 * Full consolidation job: cluster, synthesize, promote, cleanup
 */
export async function runConsolidationJob(ctx: VaultCtx): Promise<{
  clustersProcessed: number;
  factsPromoted: number;
  recordsDeleted: number;
}> {
  const candidates = await getCandidatesForConsolidation(ctx);

  // Update decay scores for all candidates
  const now = Date.now();
  const db = getVaultDb(ctx);
  const updateDecayStmt = db.prepare(`
    UPDATE memory_consolidation
    SET decay_score = ?, updated_at = ?
    WHERE id = ?
  `);
  for (const c of candidates) {
    const decay = calculateDecayScore(c.stmLastAccess, now);
    updateDecayStmt.run(decay, now, c.id);
  }

  // Re-fetch with updated decay scores
  const updatedCandidates = await getCandidatesForConsolidation(ctx);

  // Cluster
  const clusters = await clusterSTM(ctx, updatedCandidates);

  let factsPromoted = 0;
  for (const cluster of clusters) {
    // Only promote clusters with sufficient access
    const totalAccess = cluster.reduce((sum, r) => sum + r.stmAccessCount, 0);
    if (totalAccess >= PROMOTION_MIN_ACCESS) {
      const synthesis = await synthesizeCluster(ctx, cluster);
      await promoteToLTM(ctx, cluster, synthesis);
      factsPromoted += cluster.length;
    }
  }

  // Cleanup
  const recordsDeleted = await cleanupSTM(ctx);

  return {
    clustersProcessed: clusters.length,
    factsPromoted,
    recordsDeleted,
  };
}

/**
 * Get consolidation stats
 */
export async function getConsolidationStats(ctx: VaultCtx): Promise<{
  stmTotal: number;
  stmPromoted: number;
  stmActive: number;
  ltmTotal: number;
  avgDecay: number;
}> {
  const db = getVaultDb(ctx);

  const stmTotal = db.prepare("SELECT COUNT(*) as count FROM memory_consolidation").get() as { count: number };
  const stmPromoted = db.prepare("SELECT COUNT(*) as count FROM memory_consolidation WHERE ltm_promoted = 1").get() as { count: number };
  const stmActive = db.prepare("SELECT COUNT(*) as count FROM memory_consolidation WHERE ltm_promoted = 0").get() as { count: number };
  const ltmTotal = db.prepare("SELECT COUNT(*) as count FROM memories").get() as { count: number };
  const decayResult = db.prepare("SELECT AVG(decay_score) as avg FROM memory_consolidation WHERE ltm_promoted = 0").get() as { avg: number | null };

  return {
    stmTotal: stmTotal?.count ?? 0,
    stmPromoted: stmPromoted?.count ?? 0,
    stmActive: stmActive?.count ?? 0,
    ltmTotal: ltmTotal?.count ?? 0,
    avgDecay: decayResult?.avg ?? 1.0,
  };
}