import { vaultRoute } from "@/server/vault-guard";
import { readFile } from "@/lib/vault-service";
import { buildKnowledgeGraph, extractWikiLinks, findUnlinkedMentions } from "@/lib/vault-links";

interface FileRow {
  id: number;
  path: string;
  is_dir: number;
  mime: string | null;
  deleted_at: number | null;
}

/**
 * GET /api/files/links?path=/notes/xyz.md
 * Returns:
 * - If path provided: links, backlinks, and unlinked mentions for that specific file.
 * - If path omitted or '/': full KnowledgeGraph (nodes, orphans, ghosts).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const targetPath = url.searchParams.get("path");

  return vaultRoute(({ db, key }) => {
    // 1. Fetch all active markdown files
    const rows = db
      .prepare(
        "SELECT id, path, mime FROM files WHERE deleted_at IS NULL AND is_dir = 0 AND (path LIKE '%.md' OR mime LIKE '%markdown%' OR mime LIKE '%text%')"
      )
      .all() as FileRow[];

    const filesContent: Array<{ path: string; content: string }> = [];

    for (const r of rows) {
      try {
        const { bytes } = readFile({ db, key }, r.path);
        const text = Buffer.from(bytes).toString("utf-8");
        filesContent.push({ path: r.path, content: text });
      } catch {
        // Skip unreadable/corrupted files safely
      }
    }

    const graph = buildKnowledgeGraph(filesContent);

    if (!targetPath || targetPath === "/") {
      return Response.json({
        graph,
        totalFiles: filesContent.length,
      });
    }

    // Target note specific data
    const normalizedTarget = targetPath.toLowerCase().replace(/\.md$/, "");
    const matchingNode = Object.values(graph.nodes).find(
      (n) => n.id === normalizedTarget || n.path.toLowerCase() === targetPath.toLowerCase()
    );

    const targetFile = filesContent.find(
      (f) => f.path.toLowerCase() === targetPath.toLowerCase()
    );

    const knownTitles = filesContent.map((f) => {
      const base = f.path.split("/").pop() || "";
      return base.replace(/\.md$/, "");
    });

    const unlinkedMentions = targetFile
      ? findUnlinkedMentions(targetFile.content, targetPath, knownTitles)
      : [];

    const outgoingLinks = targetFile ? extractWikiLinks(targetFile.content) : [];

    return Response.json({
      path: targetPath,
      node: matchingNode ?? null,
      outgoingLinks,
      backlinks: matchingNode?.backlinks ?? [],
      unlinkedMentions,
      graphSummary: {
        totalNodes: Object.keys(graph.nodes).length,
        orphans: graph.orphans.length,
        ghosts: graph.ghosts.length,
      },
    });
  });
}
