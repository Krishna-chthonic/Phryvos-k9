/**
 * Diff Preview — generates unified diffs for approval cards
 * Shows before/after changes for write_file, move_file, delete_file tools
 */

export interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  diff: string;
  html: string;
}

/**
 * Basic line-by-line diff implementation without external dependencies
 */
function computeLineDiff(oldText: string, newText: string): Array<{ type: "same" | "add" | "remove"; line: string }> {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: Array<{ type: "same" | "add" | "remove"; line: string }> = [];

  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      result.push({ type: "same", line: oldLines[i] });
      i++;
      j++;
    } else if (j < newLines.length && (i >= oldLines.length || !oldLines.slice(i).includes(newLines[j]))) {
      result.push({ type: "add", line: newLines[j] });
      j++;
    } else if (i < oldLines.length) {
      result.push({ type: "remove", line: oldLines[i] });
      i++;
    }
  }

  return result;
}

/**
 * Generate unified diff string
 */
export function generateUnifiedDiff(
  oldContent: string,
  newContent: string,
  path: string,
  contextLines = 3
): string {
  const diffItems = computeLineDiff(oldContent, newContent);
  const lines: string[] = [
    `--- a${path}`,
    `+++ b${path}`,
    `@@ -1,${oldContent.split("\n").length} +1,${newContent.split("\n").length} @@`,
  ];

  for (const item of diffItems) {
    if (item.type === "same") {
      lines.push(` ${item.line}`);
    } else if (item.type === "add") {
      lines.push(`+${item.line}`);
    } else if (item.type === "remove") {
      lines.push(`-${item.line}`);
    }
  }

  return lines.join("\n");
}

/**
 * Render diff as HTML with styling classes
 */
export function renderDiffHtml(diffText: string): string {
  const lines = diffText.split("\n");
  const htmlLines: string[] = [];

  for (const line of lines) {
    const escaped = escapeHtml(line);
    if (line.startsWith("+++") || line.startsWith("---")) {
      htmlLines.push(`<div class="diff-header font-mono text-xs text-neutral-400 font-semibold px-2 py-0.5">${escaped}</div>`);
    } else if (line.startsWith("@@")) {
      htmlLines.push(`<div class="diff-hunk font-mono text-xs text-cyan-400 bg-cyan-950/40 px-2 py-0.5 border-y border-cyan-800/30">${escaped}</div>`);
    } else if (line.startsWith("+")) {
      htmlLines.push(`<div class="diff-add font-mono text-xs text-emerald-300 bg-emerald-950/40 px-2 py-0.5">${escaped}</div>`);
    } else if (line.startsWith("-")) {
      htmlLines.push(`<div class="diff-remove font-mono text-xs text-rose-300 bg-rose-950/40 px-2 py-0.5">${escaped}</div>`);
    } else {
      htmlLines.push(`<div class="diff-context font-mono text-xs text-neutral-300 px-2 py-0.5">${escaped}</div>`);
    }
  }

  return `<div class="diff-container overflow-x-auto rounded border border-neutral-800 bg-neutral-950/80 my-2">${htmlLines.join("")}</div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Summarize diff counts
 */
export function summarizeDiff(diffText: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;

  for (const line of diffText.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }

  return { added, removed };
}