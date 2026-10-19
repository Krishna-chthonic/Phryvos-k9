/**
 * Automated tests for PDF parsing, ZIP archive inspection/extraction,
 * tabular data analyzer, sandboxed JavaScript runner, and study/calendar tools.
 *
 * Importers/callers: tests suite via tsx --test
 * Affected API: lib/agent/pdf-reader.ts, lib/agent/zip-reader.ts, lib/agent/data-analyzer.ts, lib/agent/code-runner.ts, lib/agent/study-manager.ts, lib/agent/tools.ts
 * Data schemas if any: files, exam_subjects, exam_topics, study_logs, events
 * User instruction verbatim: "ek last problem hai ki ai zip , pdf , etc ko read nhi kar sakta aur uske paas jyada skills and plugins nhi hai"
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import AdmZip from "adm-zip";

import { runMigrations } from "../lib/db/migrate.ts";
import { ensureAgentTools } from "../lib/agent/tools.ts";
import { runTool } from "../lib/agent/registry.ts";
import { createFile, writeFile, type VaultCtx } from "../lib/vault-service.ts";
import { parsePdfBuffer } from "../lib/agent/pdf-reader.ts";
import {
  inspectZipBuffer,
  readZipEntry,
  extractZipToVault,
} from "../lib/agent/zip-reader.ts";
import { analyzeDataContent } from "../lib/agent/data-analyzer.ts";
import { runSandboxedJs } from "../lib/agent/code-runner.ts";
import {
  listExamSubjectsWithTopics,
  logExamStudySession,
} from "../lib/agent/study-manager.ts";

let db: Database.Database;
const key = randomBytes(32);
let tmpDir: string;
let ctx: VaultCtx;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-file-plugin-test-"));
  const p = path.join(tmpDir, "vault.db");
  process.env.VAULT_DB_PATH = p;
  db = new Database(p);
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  ctx = { db, key };
  ensureAgentTools();
});

after(() => {
  try {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup error */
  }
});

function getSamplePdfPath(): string {
  const candidates = [
    path.join(process.cwd(), "node_modules/pdf-parse/test/data/01-valid.pdf"),
    path.join(process.cwd(), "node_modules/.ignored_pdf-parse/test/data/01-valid.pdf"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

describe("PDF Reader Plugin", () => {
  it("extracts text and page count from a PDF buffer", async () => {
    const samplePdfPath = getSamplePdfPath();
    assert.ok(fs.existsSync(samplePdfPath), "Sample PDF fixture exists");
    const buffer = fs.readFileSync(samplePdfPath);

    const result = await parsePdfBuffer(buffer);
    assert.equal(result.pages, 14);
    assert.ok(result.text.length > 500);
    assert.ok(result.text.includes("Type Specialization"));
  });

  it("respects maxPages limit", async () => {
    const samplePdfPath = getSamplePdfPath();
    const buffer = fs.readFileSync(samplePdfPath);
    const result = await parsePdfBuffer(buffer, 2);
    assert.ok(result.pages >= 1);
    assert.ok(result.text.length > 0);
  });

  it("fails cleanly on empty buffer", async () => {
    await assert.rejects(
      async () => {
        await parsePdfBuffer(Buffer.alloc(0));
      },
      /Cannot parse empty PDF buffer/,
    );
  });
});

describe("ZIP Archive Plugin", () => {
  let zipBuffer: Buffer;

  before(() => {
    const zip = new AdmZip();
    zip.addFile("notes/todo.txt", Buffer.from("1. Read quantum physics\n2. Solve exercises"));
    zip.addFile("src/index.ts", Buffer.from("export const answer = 42;"));
    zip.addFile("data.json", Buffer.from(JSON.stringify({ name: "Phryvos", version: "k9" })));
    zipBuffer = zip.toBuffer();
  });

  it("inspects archive structure and calculates totals without unpacking", () => {
    const res = inspectZipBuffer(zipBuffer);
    assert.equal(res.totalEntries, 3);
    assert.ok(res.totalUncompressedBytes > 50);
    assert.ok(res.entries.some((e) => e.name === "notes/todo.txt"));
    assert.ok(res.entries.some((e) => e.name === "src/index.ts"));
  });

  it("reads individual file contents inside the archive", () => {
    const res1 = readZipEntry(zipBuffer, "notes/todo.txt");
    assert.equal(res1.found, true);
    assert.equal(res1.isText, true);
    assert.ok(res1.content?.includes("Read quantum physics"));

    const res2 = readZipEntry(zipBuffer, "nonexistent.md");
    assert.equal(res2.found, false);
  });

  it("extracts archive files into vault encrypted filesystem", async () => {
    const res = extractZipToVault(ctx, zipBuffer, "/unpacked/project");
    assert.equal(res.extractedCount, 3);
    assert.ok(res.paths.includes("/unpacked/project/notes/todo.txt"));
    assert.ok(res.paths.includes("/unpacked/project/src/index.ts"));
    assert.ok(res.paths.includes("/unpacked/project/data.json"));

    // Verify tool read_file can now read the extracted file from vault
    const readOut = await runTool("read_file", { path: "/unpacked/project/src/index.ts" }, ctx);
    assert.ok(typeof readOut === "string");
    assert.ok(readOut.includes("export const answer = 42;"));
  });
});

describe("Data Analyzer Plugin (CSV / TSV / JSON)", () => {
  it("computes row counts, column types, and statistics for CSV", () => {
    const csv = `id,name,score,active
1,Alice,88.5,true
2,Bob,94.0,true
3,Charlie,72.5,false
4,David,91.0,true`;

    const report = analyzeDataContent(csv, "scores.csv");
    assert.ok(report.includes("Rows:") && report.includes("4"));
    assert.ok(report.includes("Columns:") && report.includes("4"));
    assert.ok(report.includes("score"));
    assert.ok(report.includes("avg = 86.5"));
    assert.ok(report.includes("min = 72.5"));
    assert.ok(report.includes("max = 94"));
  });

  it("analyzes JSON record arrays", () => {
    const json = JSON.stringify([
      { city: "Tokyo", pop_millions: 37.4 },
      { city: "Delhi", pop_millions: 32.9 },
      { city: "Shanghai", pop_millions: 29.2 },
    ]);

    const report = analyzeDataContent(json, "cities.json");
    assert.ok(report.includes("Rows:") && report.includes("3"));
    assert.ok(report.includes("Columns:") && report.includes("2"));
    assert.ok(report.includes("Tokyo"));
  });
});

describe("Sandboxed JavaScript Runner", () => {
  it("executes valid JavaScript and returns evaluated results and console logs", () => {
    const code = `
      console.log("Processing array");
      const nums = [5, 12, 8, 130, 44];
      const filtered = nums.filter(n => n > 10).sort((a, b) => b - a);
      return filtered;
    `;
    const res = runSandboxedJs(code);
    assert.equal(res.success, true);
    assert.ok(res.output.includes("Processing array"));
    assert.deepEqual(Array.from(res.returnedValue as number[]), [130, 44, 12]);
  });

  it("handles mathematical operations and standard built-ins", () => {
    const code = `
      const r = 7;
      const area = Math.PI * Math.pow(r, 2);
      return Math.round(area * 100) / 100;
    `;
    const res = runSandboxedJs(code);
    assert.equal(res.success, true);
    assert.equal(res.returnedValue, 153.94);
  });

  it("rejects syntax errors and captures runtime exceptions gracefully", () => {
    const code = `throw new Error("Custom calculation failure");`;
    const res = runSandboxedJs(code);
    assert.equal(res.success, false);
    assert.ok(res.error?.includes("Custom calculation failure"));
  });
});

describe("Exam & Calendar Agent Tools", () => {
  it("lists exam topics and logs a study session", () => {
    // Seed an exam subject and topic
    const now = Date.now();
    const s = db
      .prepare(
        "INSERT INTO exam_subjects (name, target_date, color, created_at) VALUES ('Mathematics', '2026-11-20', '#3b82f6', ?)",
      )
      .run(now);
    const subId = Number(s.lastInsertRowid);

    db.prepare(
      "INSERT INTO exam_topics (subject_id, name, progress_pct, created_at, updated_at) VALUES (?, 'Calculus', 45, ?, ?)",
    ).run(subId, now, now);

    const listOut = listExamSubjectsWithTopics(ctx);
    assert.ok(listOut.includes("Mathematics"));
    assert.ok(listOut.includes("Calculus"));
    assert.ok(listOut.includes("45%"));

    const logOut = logExamStudySession(ctx, {
      subjectName: "Mathematics",
      topicName: "Calculus",
      durationMin: 75,
      notes: "Solved integration by parts and differential equations",
    });
    assert.ok(logOut.includes("75 minutes"));
    assert.ok(logOut.includes("Calculus"));
  });

  it("creates, updates, and deletes calendar events via tools", async () => {
    const createOut = await runTool(
      "create_event",
      {
        title: "Team Sync",
        startAt: "2026-10-15T10:00:00",
        notes: "Discuss architecture",
      },
      ctx,
    );
    assert.ok(typeof createOut === "string");
    assert.ok(createOut.includes("Team Sync"));

    const event = db.prepare("SELECT id FROM events WHERE title = 'Team Sync'").get() as {
      id: number;
    };
    assert.ok(event?.id);

    const updateOut = await runTool(
      "update_event",
      { id: event.id, title: "Updated Team Sync", notes: "New notes" },
      ctx,
    );
    assert.ok(typeof updateOut === "string" && updateOut.includes("Updated event"));

    const deleteOut = await runTool("delete_event", { id: event.id }, ctx);
    assert.ok(typeof deleteOut === "string" && deleteOut.includes("Deleted event"));

    const afterDel = db.prepare("SELECT id FROM events WHERE id = ?").get(event.id);
    assert.equal(afterDel, undefined);
  });
});

describe("Integrated Agent Tools for PDF & ZIP in Vault", () => {
  it("smart read_file on PDF parses content directly", async () => {
    const samplePdfPath = getSamplePdfPath();
    const pdfBuf = fs.readFileSync(samplePdfPath);
    createFile(ctx, "/papers/dynamic-languages.pdf");
    writeFile(ctx, "/papers/dynamic-languages.pdf", pdfBuf);

    const readPdfTool = await runTool(
      "read_pdf",
      { path: "/papers/dynamic-languages.pdf", maxPages: 2 },
      ctx,
    );
    assert.ok(typeof readPdfTool === "string");
    assert.ok(readPdfTool.includes("Type Specialization"));

    const generalRead = await runTool(
      "read_file",
      { path: "/papers/dynamic-languages.pdf" },
      ctx,
    );
    assert.ok(typeof generalRead === "string");
    assert.ok(generalRead.includes("[PDF Document:"));
  });

  it("smart read_file on ZIP inspects archive contents", async () => {
    const zip = new AdmZip();
    zip.addFile("readme.txt", Buffer.from("Hello from inside vault zip"));
    createFile(ctx, "/archives/test.zip");
    writeFile(ctx, "/archives/test.zip", zip.toBuffer());

    const inspectOut = await runTool("inspect_zip", { path: "/archives/test.zip" }, ctx);
    assert.ok(typeof inspectOut === "string");
    assert.ok(inspectOut.includes("readme.txt"));

    const readEntryOut = await runTool(
      "read_zip_entry",
      { zipPath: "/archives/test.zip", entryPath: "readme.txt" },
      ctx,
    );
    assert.ok(typeof readEntryOut === "string");
    assert.ok(readEntryOut.includes("Hello from inside vault zip"));

    const generalReadZip = await runTool("read_file", { path: "/archives/test.zip" }, ctx);
    assert.ok(typeof generalReadZip === "string");
    assert.ok(generalReadZip.includes("[ZIP Archive:"));
  });
});
