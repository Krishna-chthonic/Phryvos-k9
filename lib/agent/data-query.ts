import Database from "better-sqlite3";
import { vaultDbPath } from "../db/client";

/**
 * Sandboxed read-only SQL over the whole vault — the model's "access all my
 * data" escape hatch. It is the ONLY way the agent can run arbitrary SQL.
 *
 * Defense-in-depth:
 *  - dedicated handle opened `readonly: true` (a write simply cannot apply)
 *  - the first keyword must be SELECT / WITH
 *  - statements that embed writes or DDL are blacklisted
 *  - a LIMIT is forced when absent (rows are cheap, they are not infinite)
 */

const FORBIDDEN = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "CREATE",
  "REPLACE",
  "ATTACH",
  "DETACH",
  "PRAGMA",
  "VACUUM",
  "REINDEX",
  "SAVEPOINT",
];

export class DataQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataQueryError";
  }
}

/** Validate + force a LIMIT. Throws DataQueryError with a model-readable reason. */
export function validateQuery(sql: string): string {
  let s = sql.trim().replace(/\s+/g, " ");
  if (!s) throw new DataQueryError("empty query");
  const first = s.split(/\s+/)[0].toUpperCase();
  if (first !== "SELECT" && first !== "WITH") {
    throw new DataQueryError(
      `query must start with SELECT or WITH (got ${first.toLowerCase()}); only read-only queries are allowed`,
    );
  }
  if (s.includes(";")) throw new DataQueryError("multiple statements (';') are not allowed");
  const up = s.toUpperCase();
  for (const kw of FORBIDDEN) {
    if (new RegExp(`\\b${kw}\\b`).test(up)) {
      throw new DataQueryError(`"${kw}" is not allowed in a read-only query`);
    }
  }
  const noLimit = /\bLIMIT\s+\d+(\s*,\s*\d+)?\s*$/i.test(s) || /\bLIMIT\s+\S+;\s*$/i.test(s);
  if (!noLimit) s = `${s} LIMIT 200`;
  return s;
}

/**
 * Run a validated query on a fresh read-only handle. The handle is per-call
 * (cheap in WAL mode, and keeps the sandbox from ever sharing state with
 * the main connection).
 */
export function runDataQuery(sql: string): unknown[] {
  const safe = validateQuery(sql);
  const ro = new Database(vaultDbPath(), { readonly: true, fileMustExist: true });
  try {
    ro.pragma("busy_timeout = 5000");
    ro.pragma("query_only = ON");
    const rows = ro.prepare(safe).all();
    return rows as unknown[];
  } finally {
    ro.close();
  }
}

/** Rows → compact JSON string for the model context (truncated by the loop). */
export function formatRows(rows: unknown[]): string {
  if (rows.length === 0) return "(no rows)";
  return JSON.stringify(rows, null, 1);
}
