/**
 * Tabular and structured dataset analyzer (CSV, TSV, JSON) for phryvos-k9 agent tools.
 *
 * Importers/callers: lib/agent/tools.ts, tests/file-plugins.test.ts
 * Affected API: Agent tool execution (analyze_data_file)
 * Data schemas if any: Vault files table (text content of datasets)
 * User instruction verbatim: "ek last problem hai ki ai zip , pdf , etc ko read nhi kar sakta aur uske paas jyada skills and plugins nhi hai"
 */

export interface ColumnStat {
  name: string;
  inferredType: "number" | "boolean" | "date" | "string";
  count: number;
  nullCount: number;
  distinctCount: number;
  min?: number | string;
  max?: number | string;
  average?: number;
  sum?: number;
  sampleValues: string[];
}

export interface AnalysisSummary {
  format: "csv" | "tsv" | "json";
  rowCount: number;
  columnCount: number;
  columns: ColumnStat[];
  previewRows: Array<Record<string, unknown>>;
}

/**
 * Parses CSV/TSV text into an array of row records, taking headers from line 1.
 */
function parseDelimited(text: string, delimiter: string): Array<Record<string, string>> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseLine(lines[0], delimiter);
  const records: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] !== undefined ? values[j] : "";
    }
    records.push(row);
  }
  return records;
}

function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Analyzes tabular data (CSV, TSV, or JSON records) and produces a comprehensive summary.
 */
export function analyzeDataContent(
  content: string,
  fileNameHint?: string,
): string {
  const raw = content.trim();
  if (!raw) return "File content is empty.";

  let records: Array<Record<string, unknown>> = [];
  let format: "csv" | "tsv" | "json" = "csv";

  // Check if JSON
  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      format = "json";
      if (Array.isArray(parsed)) {
        if (parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null) {
          records = parsed as Array<Record<string, unknown>>;
        } else {
          return `JSON array with ${parsed.length} primitive items:\n${JSON.stringify(parsed.slice(0, 10), null, 2)}`;
        }
      } else if (typeof parsed === "object" && parsed !== null) {
        const keys = Object.keys(parsed);
        return `JSON Object containing ${keys.length} top-level keys: ${keys.slice(0, 30).join(", ")}${keys.length > 30 ? "…" : ""}\n\nTop-level preview:\n${JSON.stringify(parsed, null, 2).slice(0, 3000)}`;
      }
    } catch {
      // not JSON, fallback to CSV/TSV
    }
  }

  if (records.length === 0) {
    const isTsv =
      (fileNameHint && fileNameHint.toLowerCase().endsWith(".tsv")) ||
      (!raw.includes(",") && raw.includes("\t"));
    format = isTsv ? "tsv" : "csv";
    const delimiter = isTsv ? "\t" : ",";
    records = parseDelimited(raw, delimiter);
  }

  if (records.length === 0) {
    return "Could not extract tabular rows or columns from file content.";
  }

  const columns = Object.keys(records[0] || {});
  const rowCount = records.length;
  const colStats: ColumnStat[] = [];

  for (const col of columns) {
    let nullCount = 0;
    const values: unknown[] = [];
    let numCount = 0;
    let sum = 0;
    let minNum = Infinity;
    let maxNum = -Infinity;
    const distinctSet = new Set<string>();

    for (const r of records) {
      const val = r[col];
      if (val === undefined || val === null || val === "") {
        nullCount++;
      } else {
        values.push(val);
        distinctSet.add(String(val));
        const n = Number(val);
        if (!isNaN(n) && typeof val !== "boolean") {
          numCount++;
          sum += n;
          if (n < minNum) minNum = n;
          if (n > maxNum) maxNum = n;
        }
      }
    }

    const nonNullCount = values.length;
    const isNumCol = nonNullCount > 0 && numCount / nonNullCount > 0.8;

    const sample = Array.from(distinctSet).slice(0, 5);

    if (isNumCol) {
      colStats.push({
        name: col,
        inferredType: "number",
        count: nonNullCount,
        nullCount,
        distinctCount: distinctSet.size,
        min: minNum,
        max: maxNum,
        sum: Math.round(sum * 100) / 100,
        average: Math.round((sum / (numCount || 1)) * 100) / 100,
        sampleValues: sample,
      });
    } else {
      colStats.push({
        name: col,
        inferredType: "string",
        count: nonNullCount,
        nullCount,
        distinctCount: distinctSet.size,
        sampleValues: sample,
      });
    }
  }

  // Format a clean Markdown report
  const lines: string[] = [];
  lines.push(`### Dataset Overview (${format.toUpperCase()})`);
  lines.push(`- **Rows:** ${rowCount.toLocaleString()}`);
  lines.push(`- **Columns:** ${columns.length} (${columns.join(", ")})`);
  lines.push("");
  lines.push("#### Column Statistics:");

  for (const cs of colStats) {
    if (cs.inferredType === "number") {
      lines.push(
        `- **\`${cs.name}\`** [Number]: min = ${cs.min}, max = ${cs.max}, avg = ${cs.average}, sum = ${cs.sum} (${cs.distinctCount} unique, ${cs.nullCount} nulls)`,
      );
    } else {
      lines.push(
        `- **\`${cs.name}\`** [${cs.inferredType}]: ${cs.distinctCount} unique (${cs.nullCount} nulls). Samples: [${cs.sampleValues.map((s) => `"${s}"`).join(", ")}]`,
      );
    }
  }

  lines.push("");
  lines.push("#### Sample Records (Top 5):");
  lines.push("```json");
  lines.push(JSON.stringify(records.slice(0, 5), null, 2));
  lines.push("```");

  return lines.join("\n");
}
