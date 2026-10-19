/**
 * PDF text extraction and parsing service for phryvos-k9 agent tools.
 *
 * Importers/callers: lib/agent/tools.ts, tests/file-plugins.test.ts
 * Affected API: Agent tool execution (read_pdf, read_file)
 * Data schemas if any: Vault files table (binary content_enc blob)
 * User instruction verbatim: "ek last problem hai ki ai zip , pdf , etc ko read nhi kar sakta aur uske paas jyada skills and plugins nhi hai"
 */
// @ts-expect-error - pdf-parse/lib/pdf-parse.js lacks standalone type declaration
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export interface PdfParseResult {
  pages: number;
  text: string;
  info?: Record<string, unknown>;
  truncated: boolean;
}

/**
 * Extracts readable text from a PDF Buffer.
 * Safely caps excessive output so it fits within LLM context windows.
 */
export async function parsePdfBuffer(
  buffer: Buffer,
  maxPages?: number,
  maxChars = 60_000,
): Promise<PdfParseResult> {
  if (!buffer || buffer.length === 0) {
    throw new Error("Cannot parse empty PDF buffer.");
  }

  const options: Record<string, unknown> = {};
  if (maxPages && maxPages > 0) {
    options.max = maxPages;
  }

  try {
    const data = await pdfParse(buffer, options);
    const rawText = data.text ? data.text.replace(/\r\n/g, "\n").trim() : "";
    const isTruncated = rawText.length > maxChars;
    const cleanText = isTruncated
      ? `${rawText.slice(0, maxChars)}\n\n… [Truncated: ${rawText.length - maxChars} more characters in PDF. You can request specific page ranges or sections.]`
      : rawText;

    return {
      pages: data.numpages || 1,
      text: cleanText,
      info: data.info || {},
      truncated: isTruncated,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse PDF: ${msg}`);
  }
}
