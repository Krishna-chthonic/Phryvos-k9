/**
 * ZIP archive inspection, entry extraction, and unpack service for phryvos-k9 agent tools.
 *
 * Importers/callers: lib/agent/tools.ts, tests/file-plugins.test.ts
 * Affected API: Agent tool execution (inspect_zip, read_zip_entry, extract_zip, read_file)
 * Data schemas if any: Vault files table (binary content_enc blob)
 * User instruction verbatim: "ek last problem hai ki ai zip , pdf , etc ko read nhi kar sakta aur uske paas jyada skills and plugins nhi hai"
 */
import AdmZip from "adm-zip";
import {
  createDir,
  createFile,
  getMeta,
  writeFile,
  VaultError,
  type VaultCtx,
} from "../vault-service";

export interface ZipEntrySummary {
  name: string;
  isDirectory: boolean;
  sizeBytes: number;
  compressedSizeBytes: number;
  time: string;
}

export interface ZipInspectionResult {
  totalEntries: number;
  totalUncompressedBytes: number;
  entries: ZipEntrySummary[];
}

export interface ZipEntryReadResult {
  found: boolean;
  name: string;
  isDirectory: boolean;
  isText: boolean;
  sizeBytes: number;
  content?: string;
  mime?: string;
}

const isTextFile = (name: string): boolean => {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".json") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".tsv") ||
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".html") ||
    lower.endsWith(".css") ||
    lower.endsWith(".scss") ||
    lower.endsWith(".xml") ||
    lower.endsWith(".yaml") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".py") ||
    lower.endsWith(".c") ||
    lower.endsWith(".cpp") ||
    lower.endsWith(".h") ||
    lower.endsWith(".java") ||
    lower.endsWith(".rs") ||
    lower.endsWith(".go") ||
    lower.endsWith(".sh") ||
    lower.endsWith(".sql") ||
    lower.endsWith(".env") ||
    lower.endsWith(".ini") ||
    lower.endsWith(".toml") ||
    lower.endsWith(".log")
  );
};

/**
 * Inspect a ZIP buffer without extracting it to disk or vault.
 */
export function inspectZipBuffer(buffer: Buffer): ZipInspectionResult {
  if (!buffer || buffer.length === 0) {
    throw new Error("Cannot inspect empty ZIP buffer.");
  }

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  let totalBytes = 0;
  const list: ZipEntrySummary[] = [];

  for (const e of entries) {
    totalBytes += e.header.size;
    list.push({
      name: e.entryName,
      isDirectory: e.isDirectory,
      sizeBytes: e.header.size,
      compressedSizeBytes: e.header.compressedSize,
      time: e.header.time ? new Date(e.header.time).toISOString() : "",
    });
  }

  return {
    totalEntries: entries.length,
    totalUncompressedBytes: totalBytes,
    entries: list,
  };
}

/**
 * Read the content of a single specific file inside a ZIP buffer.
 */
export function readZipEntry(
  buffer: Buffer,
  entryPath: string,
  maxChars = 60_000,
): ZipEntryReadResult {
  if (!buffer || buffer.length === 0) {
    throw new Error("Cannot read from empty ZIP buffer.");
  }

  const zip = new AdmZip(buffer);
  const norm = entryPath.trim().replace(/^\//, "");
  const entry = zip.getEntry(norm);

  if (!entry) {
    // Try relaxed search by filename if direct match fails
    const candidate = zip.getEntries().find(
      (e) =>
        e.entryName.toLowerCase() === norm.toLowerCase() ||
        e.entryName.endsWith("/" + norm) ||
        e.name.toLowerCase() === norm.toLowerCase(),
    );
    if (!candidate) {
      return {
        found: false,
        name: norm,
        isDirectory: false,
        isText: false,
        sizeBytes: 0,
      };
    }
    return readZipEntryObject(zip, candidate, maxChars);
  }

  return readZipEntryObject(zip, entry, maxChars);
}

function readZipEntryObject(
  zip: AdmZip,
  entry: AdmZip.IZipEntry,
  maxChars: number,
): ZipEntryReadResult {
  if (entry.isDirectory) {
    return {
      found: true,
      name: entry.entryName,
      isDirectory: true,
      isText: false,
      sizeBytes: 0,
    };
  }

  const isText = isTextFile(entry.entryName);
  if (!isText) {
    return {
      found: true,
      name: entry.entryName,
      isDirectory: false,
      isText: false,
      sizeBytes: entry.header.size,
      content: `[Binary file inside archive (${entry.header.size} bytes). Extract using 'extract_zip' to save to vault.]`,
    };
  }

  const raw = zip.readAsText(entry);
  const isTruncated = raw.length > maxChars;
  const content = isTruncated
    ? `${raw.slice(0, maxChars)}\n\n… [Truncated: ${raw.length - maxChars} more characters in ${entry.entryName}]`
    : raw;

  return {
    found: true,
    name: entry.entryName,
    isDirectory: false,
    isText: true,
    sizeBytes: entry.header.size,
    content,
  };
}

/**
 * Extract files from a ZIP buffer directly into the encrypted vault file tree.
 */
export function extractZipToVault(
  ctx: VaultCtx,
  buffer: Buffer,
  destinationDir: string,
): { extractedCount: number; totalBytes: number; paths: string[] } {
  if (!buffer || buffer.length === 0) {
    throw new Error("Cannot extract from empty ZIP buffer.");
  }

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const dest = destinationDir.trim().replace(/\/+$/, "") || "/";

  // Ensure destination directory exists
  try {
    createDir(ctx, dest);
  } catch (e) {
    if (!(e instanceof VaultError && e.code === "exists")) {
      // ignore if already exists
    }
  }

  const createdPaths: string[] = [];
  let totalBytes = 0;

  for (const entry of entries) {
    const relativePath = entry.entryName.replace(/^\/+/, "");
    const targetPath = `${dest}/${relativePath}`.replace(/\/+/g, "/");

    if (entry.isDirectory) {
      try {
        createDir(ctx, targetPath);
      } catch {
        /* ignore exists */
      }
      continue;
    }

    const data = zip.readFile(entry);
    if (!data) continue;

    try {
      getMeta(ctx, targetPath);
    } catch (e) {
      if (e instanceof VaultError && e.code === "not_found") {
        createFile(ctx, targetPath);
      }
    }

    writeFile(ctx, targetPath, data, `Extracted from ZIP archive`);
    createdPaths.push(targetPath);
    totalBytes += data.length;
  }

  return {
    extractedCount: createdPaths.length,
    totalBytes,
    paths: createdPaths,
  };
}
