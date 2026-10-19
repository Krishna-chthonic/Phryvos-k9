import type Database from "better-sqlite3";
import { registerTool, type ToolDef } from "./registry";
import { z } from "zod";

/**
 * Autonomous Custom Skills & Plugins System for Phryvos K9.
 *
 * Allows the AI to dynamically discover, create, execute, and uninstall custom tools on the fly.
 * Skills are persisted in SQLite (custom_skills table) and loaded on agent initialization.
 */

export interface CustomSkillRow {
  id: number;
  name: string;
  description: string;
  parameters: string; // JSON string of parameters schema
  code: string;       // JavaScript code function body
  created_at: number;
}

let tableInitialized = false;

export function initCustomSkillsTable(db: Database.Database): void {
  if (tableInitialized) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS custom_skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        parameters TEXT NOT NULL,
        code TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    tableInitialized = true;
  } catch (e) {
    console.error("Failed to init custom_skills table:", e);
  }
}

/**
 * Wrap and register a single custom skill row as an executable tool.
 */
export function registerCustomSkillRow(row: CustomSkillRow): void {
  let paramsObj: Record<string, unknown> = {
    type: "object",
    properties: {},
    required: [],
  };

  try {
    paramsObj = JSON.parse(row.parameters);
  } catch {
    // fallback empty params
  }

  const def: ToolDef = {
    spec: {
      type: "function",
      function: {
        name: row.name,
        description: `${row.description} [Custom Skill]`,
        parameters: paramsObj,
      },
    },
    destructive: false,
    run: async (args: Record<string, unknown>, ctx) => {
      try {
        // Execute the custom skill JavaScript in an isolated async function
        // Available injected helpers: args, ctx, db, fetch
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const fn = new AsyncFunction("args", "ctx", "fetch", row.code);
        const result = await fn(args, ctx, globalThis.fetch);
        if (typeof result === "object") {
          return JSON.stringify(result, null, 2);
        }
        return String(result ?? "Skill executed successfully with no output.");
      } catch (err) {
        return `ERROR in custom skill ${row.name}: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  registerTool(def);
}

/**
 * Load all custom skills from SQLite and register into agent tools.
 */
export function loadAndRegisterCustomSkills(db: Database.Database): void {
  initCustomSkillsTable(db);
  try {
    const rows = db.prepare("SELECT * FROM custom_skills ORDER BY name ASC").all() as CustomSkillRow[];
    for (const row of rows) {
      registerCustomSkillRow(row);
    }
  } catch (err) {
    console.error("Failed to load custom skills:", err);
  }
}

/**
 * Tool handler: install_skill
 */
export async function toolInstallSkill(
  args: Record<string, unknown>,
  ctx: { db: Database.Database },
): Promise<string> {
  initCustomSkillsTable(ctx.db);
  const name = String(args.name || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const description = String(args.description || "").trim();
  const code = String(args.code || "").trim();
  let parameters = "{}";

  if (!name) return "ERROR: Skill name is required (snake_case).";
  if (!description) return "ERROR: Skill description is required.";
  if (!code) return "ERROR: JavaScript code for the skill is required.";

  if (typeof args.parameters === "object" && args.parameters !== null) {
    parameters = JSON.stringify(args.parameters);
  } else if (typeof args.parameters === "string") {
    parameters = args.parameters;
  }

  // Validate syntax
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    new AsyncFunction("args", "ctx", "fetch", code);
  } catch (err) {
    return `ERROR: Invalid JavaScript syntax in skill code: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    ctx.db
      .prepare(
        `INSERT INTO custom_skills (name, description, parameters, code, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           description = excluded.description,
           parameters = excluded.parameters,
           code = excluded.code`,
      )
      .run(name, description, parameters, code, Date.now());

    // Immediately register in memory
    const row: CustomSkillRow = {
      id: 0,
      name,
      description,
      parameters,
      code,
      created_at: Date.now(),
    };
    registerCustomSkillRow(row);

    return `✔ Successfully installed custom skill "${name}"!\nDescription: ${description}\nIt is now registered and ready to use in this or subsequent steps.`;
  } catch (err) {
    return `ERROR installing skill: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Tool handler: list_skills
 */
export async function toolListSkills(
  _args: Record<string, unknown>,
  ctx: { db: Database.Database },
): Promise<string> {
  initCustomSkillsTable(ctx.db);
  try {
    const rows = ctx.db
      .prepare("SELECT name, description, created_at FROM custom_skills ORDER BY name ASC")
      .all() as Array<{ name: string; description: string; created_at: number }>;

    if (!rows.length) {
      return "No custom skills installed yet. You can install new skills using install_skill.";
    }

    const lines = rows.map(
      (r, i) => `${i + 1}. **${r.name}**: ${r.description} (Installed: ${new Date(r.created_at).toLocaleDateString()})`,
    );
    return `Installed Custom Skills (${rows.length}):\n${lines.join("\n")}`;
  } catch (err) {
    return `ERROR listing skills: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Tool handler: remove_skill
 */
export async function toolRemoveSkill(
  args: Record<string, unknown>,
  ctx: { db: Database.Database },
): Promise<string> {
  initCustomSkillsTable(ctx.db);
  const name = String(args.name || "").trim().toLowerCase();
  if (!name) return "ERROR: Skill name is required to remove.";

  try {
    const res = ctx.db.prepare("DELETE FROM custom_skills WHERE name = ?").run(name);
    if (res.changes === 0) {
      return `Skill "${name}" was not found in installed custom skills.`;
    }
    return `✔ Custom skill "${name}" has been uninstalled.`;
  } catch (err) {
    return `ERROR removing skill: ${err instanceof Error ? err.message : String(err)}`;
  }
}
