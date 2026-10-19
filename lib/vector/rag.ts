/**
 * Vector RAG — file_chunks table operations: upsert, search, delete, reindex
 * All content encrypted at rest via envelope encryption
 */

import { type VaultCtx, getVaultDb } from "@/lib/dal/vault-dal";
import { encryptBlob, gcmDecrypt } from "@/lib/crypto/envelope";
import { generateEmbeddings, embeddingToBuffer, bufferToEmbedding, cosineSimilarity, ChunkData, chunkText, chunkCode } from "@/lib/vector/embeddings";

export interface SearchResult {
  filePath: string;
  chunkIndex: number;
  content: string;
  score: number;
  tokenCount: number;
}

export interface ChunkRecord {
  id: number;
  filePath: string;
  chunkIndex: number;
  contentEnc: Buffer;
  contentNonce: Buffer;
  contentTag: Buffer;
  embedding: Buffer;
  embeddingModel: string;
  tokenCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChunkRecordWithContent extends ChunkRecord {
  content: string;
}

/**
 * Get all chunks for a file path
 */
export async function getChunksForFile(
  ctx: VaultCtx,
  filePath: string
): Promise<ChunkRecord[]> {
  const db = getVaultDb(ctx);
  return db.prepare("SELECT * FROM file_chunks WHERE file_path = ? ORDER BY chunk_index").all(filePath) as ChunkRecord[];
}

/**
 * Delete all chunks for a file path
 */
export async function deleteChunksForFile(
  ctx: VaultCtx,
  filePath: string
): Promise<number> {
  const db = getVaultDb(ctx);
  const result = db.prepare("DELETE FROM file_chunks WHERE file_path = ?").run(filePath);
  return result.changes;
}

/**
 * Upsert chunks for a file (delete old, insert new)
 */
export async function upsertFileChunks(
  ctx: VaultCtx,
  filePath: string,
  content: string,
  mimeType?: string
): Promise<number> {
  // Delete existing chunks
  await deleteChunksForFile(ctx, filePath);

  // Chunk the content
  let chunks: ChunkData[];
  if (mimeType?.startsWith("text/") || mimeType === "application/json" || filePath.endsWith(".md") || filePath.endsWith(".txt")) {
    chunks = chunkText(content, 500, 50, filePath);
  } else if (mimeType?.startsWith("application/") || filePath.match(/\.(ts|js|py|rs|go|java|cpp|h)$/)) {
    chunks = chunkCode(content, filePath);
  } else {
    chunks = chunkText(content, 500, 50, filePath);
  }

  if (chunks.length === 0) return 0;

  // Generate embeddings
  const embeddingResults = await generateEmbeddings(ctx, chunks);

  // Encrypt content and store
  const db = getVaultDb(ctx);
  let inserted = 0;

  const insertStmt = db.prepare(`
    INSERT INTO file_chunks (file_path, chunk_index, content_enc, content_nonce, content_tag, embedding, embedding_model, token_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embResult = embeddingResults[i];

    // Encrypt content
    const contentBuf = Buffer.from(chunk.content, "utf8");
    const encrypted = encryptBlob(ctx.key, contentBuf);

    // Store embedding
    const embBuffer = embeddingToBuffer(embResult.embedding);
    const now = Date.now();

    insertStmt.run(
      chunk.filePath,
      chunk.chunkIndex,
      encrypted.enc,
      encrypted.nonce,
      encrypted.tag,
      embBuffer,
      embResult.model,
      chunk.tokenCount,
      now,
      now
    );
    inserted++;
  }

  return inserted;
}

/**
 * Search for relevant chunks using cosine similarity
 */
export async function searchChunks(
  ctx: VaultCtx,
  query: string,
  k: number = 5,
  filePaths?: string[]
): Promise<SearchResult[]> {
  // Generate query embedding
  const queryChunks = chunkText(query, 500, 0);
  const queryEmbeddings = await generateEmbeddings(ctx, queryChunks);
  if (queryEmbeddings.length === 0) return [];
  const queryEmbedding = queryEmbeddings[0].embedding;

  // Fetch candidate chunks
  const db = getVaultDb(ctx);
  let candidates: ChunkRecord[];

  if (filePaths && filePaths.length > 0) {
    candidates = [];
    const stmt = db.prepare("SELECT * FROM file_chunks WHERE file_path = ?");
    for (const fp of filePaths) {
      const chunks = stmt.all(fp) as ChunkRecord[];
      candidates.push(...chunks);
    }
  } else {
    // Limit to prevent full table scan
    candidates = db.prepare("SELECT * FROM file_chunks LIMIT 5000").all() as ChunkRecord[];
  }

  if (candidates.length === 0) return [];

  // Decrypt embeddings and compute similarity
  const scored: { score: number; data: ChunkRecord & { content: string } }[] = [];

  for (const chunk of candidates) {
    try {
      const embedding = bufferToEmbedding(chunk.embedding);
      const score = cosineSimilarity(queryEmbedding, embedding);

      if (score > 0.3) { // threshold
        // Decrypt content
        const decrypted = gcmDecrypt(ctx.key, {
          enc: chunk.contentEnc,
          nonce: chunk.contentNonce,
          tag: chunk.contentTag,
        });
        const content = Buffer.from(decrypted).toString("utf8");

        scored.push({ score, data: { ...chunk, content } });
      }
    } catch {
      // Skip corrupted chunks
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, k).map((s) => ({
    filePath: s.data.filePath,
    chunkIndex: s.data.chunkIndex,
    content: s.data.content,
    score: s.score,
    tokenCount: s.data.tokenCount,
  }));
}

/**
 * Reindex all files in the vault
 */
export async function reindexAllFiles(ctx: VaultCtx): Promise<{ files: number; chunks: number }> {
  const db = getVaultDb(ctx);
  const allFiles = db.prepare(`
    SELECT * FROM files WHERE is_dir = 0 AND deleted_at IS NULL
  `).all() as Array<{
    path: string;
    contentEnc: Buffer | null;
    nonce: Buffer | null;
    tag: Buffer | null;
    mime: string | null;
  }>;

  let totalChunks = 0;

  for (const file of allFiles) {
    if (!file.contentEnc) continue;

    try {
      // Decrypt file content
      const decrypted = gcmDecrypt(ctx.key, {
        enc: file.contentEnc,
        nonce: file.nonce!,
        tag: file.tag!,
      });
      const content = Buffer.from(decrypted).toString("utf8");

      // Upsert chunks
      const count = await upsertFileChunks(ctx, file.path, content, file.mime || undefined);
      totalChunks += count;
    } catch (e) {
      console.warn(`[RAG] Failed to index ${file.path}:`, e);
    }
  }

  return { files: allFiles.length, chunks: totalChunks };
}

/**
 * Get RAG stats
 */
export async function getRagStats(ctx: VaultCtx): Promise<{
  totalChunks: number;
  totalFiles: number;
  models: string[];
}> {
  const db = getVaultDb(ctx);

  const chunksResult = db.prepare("SELECT COUNT(*) as count FROM file_chunks").get() as { count: number };
  const filesResult = db.prepare("SELECT COUNT(*) as count FROM files WHERE is_dir = 0 AND deleted_at IS NULL").get() as { count: number };
  const modelsResult = db.prepare("SELECT DISTINCT embedding_model as model FROM file_chunks").all() as { model: string }[];

  return {
    totalChunks: chunksResult?.count ?? 0,
    totalFiles: filesResult?.count ?? 0,
    models: modelsResult.map((m) => m.model),
  };
}