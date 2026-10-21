import type { ToolSpec } from "../ai/types";
import type { VaultCtx } from "../vault-service";
import { z } from "zod";
import { lintToolExecution } from "./safety-linter";

/**
 * Agent tool registry. Tools are defined ONCE in OpenAI function-calling
 * shape; the adapters translate to their wire format. Destructive tools
 * (writes/deletes/moves of user data) are approval-gated by the loop.
 */

export interface ToolDef {
  spec: ToolSpec;
  /** true ⇒ the loop asks the user for approval before executing */
  destructive?: boolean;
  /** optional zod schema — failures become model-visible tool-result errors */
  schema?: z.ZodTypeAny;
  /**
   * Execute. Return a short, model-friendly text result (truncated by the
   * loop). Throw for unexpected failures; the loop turns them into a
   * `ERROR: …` result the model can react to.
   */
  run: (args: Record<string, unknown>, ctx: VaultCtx) => Promise<string> | string;
}

const defs = new Map<string, ToolDef>();

export function registerTool(def: ToolDef): void {
  defs.set(def.spec.function.name, def);
}

export function toolDefs(): Record<string, ToolDef> {
  return Object.fromEntries(defs);
}

export function toolSpecs(allowedTools?: string[]): ToolSpec[] {
  const all = [...defs.values()].map((d) => d.spec);
  if (allowedTools === undefined) return all;
  const set = new Set(allowedTools);
  return all.filter((s) => set.has(s.function.name));
}

export function isDestructive(name: string): boolean {
  return defs.get(name)?.destructive ?? false;
}

/**
 * Validate + run a tool. Never throws: failures are returned as
 * `ERROR: …` / `DENIED: …` strings so the model sees them as a tool result
 * and can recover — that is the whole point of the loop.
 */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: VaultCtx,
  allowedTools?: string[],
): Promise<string> {
  // Server-side permission boundary
  if (allowedTools !== undefined && !allowedTools.includes(name)) {
    return `DENIED: Tool "${name}" is not enabled for this agent.${
      allowedTools.length ? " Allowed tools: " + allowedTools.join(", ") : " No tools are enabled."
    }`;
  }

  const def = defs.get(name);
  if (!def) return `ERROR: unknown tool "${name}"`;

  // Pre-flight safety lint (iFixAi Guardrail)
  const safety = lintToolExecution(name, args ?? {});
  if (!safety.ok) {
    return `DENIED: ${safety.reason}`;
  }

  if (def.schema) {
    const parsed = def.schema.safeParse(args ?? {});
    if (!parsed.success) {
      const msg = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return `ERROR: invalid arguments for ${name} — ${msg}`;
    }
  }
  try {
    const out = await def.run(args ?? {}, ctx);
    return out;
  } catch (e) {
    return `ERROR: ${name} failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}
