/**
 * Vault Links Engine — Bi-directional [[wiki-links]] & Knowledge Graph
 * 
 * Supports:
 * - [[Note Title]]
 * - [[folder/Note Title]]
 * - [[Note Title|Custom Alias]]
 * - [[Note Title#Heading]]
 * 
 * Extracts backlinks, outgoing links, broken/ghost references,
 * and maintains bidirectional topological link indexes.
 */

export interface WikiLink {
  raw: string;
  target: string;
  alias?: string;
  anchor?: string;
  startIndex: number;
  endIndex: number;
  lineNumber: number;
}

export interface LinkNode {
  id: string; // normalized path or title
  title: string;
  path: string;
  outgoing: string[];
  backlinks: string[];
  exists: boolean;
}

export interface KnowledgeGraph {
  nodes: Record<string, LinkNode>;
  orphans: string[];
  ghosts: string[]; // referenced links that don't exist yet
}

// Regex matching [[target]], [[target|alias]], [[target#anchor]], [[target#anchor|alias]]
const WIKI_LINK_REGEX = /\[\[([^\]|#\n]+)(?:#([^\]|\n]+))?(?:\|([^\]\n]+))?\]\]/g;

/**
 * Extracts all [[wiki-links]] from raw markdown text
 */
export function extractWikiLinks(content: string): WikiLink[] {
  const links: WikiLink[] = [];
  const lines = content.split("\n");
  let currentOffset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    let match: RegExpExecArray | null;

    WIKI_LINK_REGEX.lastIndex = 0;
    while ((match = WIKI_LINK_REGEX.exec(line)) !== null) {
      const raw = match[0];
      const target = match[1].trim();
      const anchor = match[2]?.trim();
      const alias = match[3]?.trim();
      const startIndex = currentOffset + match.index;
      const endIndex = startIndex + raw.length;

      links.push({
        raw,
        target,
        anchor: anchor || undefined,
        alias: alias || undefined,
        startIndex,
        endIndex,
        lineNumber: lineIndex + 1,
      });
    }

    currentOffset += line.length + 1; // +1 for the newline
  }

  return links;
}

/**
 * Normalizes title or relative path into standard node ID
 */
export function normalizeLinkId(target: string): string {
  return target
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\.md$/, "")
    .replace(/^\.\//, "")
    .trim();
}

/**
 * Builds a bi-directional Knowledge Graph from a set of vault files
 */
export function buildKnowledgeGraph(
  files: Array<{ path: string; content: string }>
): KnowledgeGraph {
  const nodes: Record<string, LinkNode> = {};
  const fileIdMap: Record<string, string> = {};

  // 1. Initialize existing nodes
  for (const file of files) {
    const baseName = file.path.split("/").pop()?.replace(/\.md$/, "") || file.path;
    const normId = normalizeLinkId(file.path);
    const normBaseId = normalizeLinkId(baseName);

    fileIdMap[normId] = normId;
    fileIdMap[normBaseId] = normId;

    nodes[normId] = {
      id: normId,
      title: baseName,
      path: file.path,
      outgoing: [],
      backlinks: [],
      exists: true,
    };
  }

  // 2. Extract outgoing links & populate backlinks
  for (const file of files) {
    const sourceId = normalizeLinkId(file.path);
    const extracted = extractWikiLinks(file.content);

    for (const link of extracted) {
      const rawTarget = normalizeLinkId(link.target);
      const targetId = fileIdMap[rawTarget] || rawTarget;

      // Add to source outgoing links if not already present
      if (!nodes[sourceId].outgoing.includes(targetId)) {
        nodes[sourceId].outgoing.push(targetId);
      }

      // Ensure target node exists (as ghost if not created)
      if (!nodes[targetId]) {
        nodes[targetId] = {
          id: targetId,
          title: link.target,
          path: link.target.endsWith(".md") ? link.target : `${link.target}.md`,
          outgoing: [],
          backlinks: [],
          exists: false,
        };
      }

      // Add to target backlinks
      if (!nodes[targetId].backlinks.includes(sourceId)) {
        nodes[targetId].backlinks.push(sourceId);
      }
    }
  }

  // 3. Find orphans (no backlinks and no outgoing) and ghosts (referenced but not exist)
  const orphans: string[] = [];
  const ghosts: string[] = [];

  for (const id of Object.keys(nodes)) {
    const node = nodes[id];
    if (!node.exists) {
      ghosts.push(id);
    } else if (node.outgoing.length === 0 && node.backlinks.length === 0) {
      orphans.push(id);
    }
  }

  return { nodes, orphans, ghosts };
}

/**
 * Replaces or wraps unlinked mentions of known notes in content
 */
export function findUnlinkedMentions(
  content: string,
  currentPath: string,
  knownTitles: string[]
): Array<{ title: string; startIndex: number; endIndex: number; lineNumber: number }> {
  const currentTitle = currentPath.split("/").pop()?.replace(/\.md$/, "") || "";
  const mentions: Array<{ title: string; startIndex: number; endIndex: number; lineNumber: number }> = [];
  const lines = content.split("\n");
  let currentOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const title of knownTitles) {
      if (!title || title.length < 3 || title.toLowerCase() === currentTitle.toLowerCase()) continue;

      // Search for whole-word case-insensitive match not inside [[ ]]
      const regex = new RegExp(`(?<!\\[\\[.*)\\b(${escapeRegex(title)})\\b(?!.*\\]\\])`, "gi");
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        mentions.push({
          title,
          startIndex: currentOffset + match.index,
          endIndex: currentOffset + match.index + match[0].length,
          lineNumber: i + 1,
        });
      }
    }
    currentOffset += line.length + 1;
  }

  return mentions;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
