/**
 * Hermes Autonomous Skill Synthesis Engine
 * Inspired by NousResearch Hermes-Agent
 * 
 * Allows Dots to self-synthesize reusable skills from solved tasks,
 * generating structured SKILL.md documentation in the user's vault
 * while simultaneously registering live executable tools in SQLite.
 */

import type Database from "better-sqlite3";
import { toolInstallSkill } from "./custom-skills";
import { createFile, writeFile, getMeta, type VaultCtx } from "../vault-service";

export interface SkillSynthesisInput {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  code: string;
  exampleUsage?: string;
  authorDot?: string;
}

/**
 * Formats a standardized SKILL.md document with YAML frontmatter
 */
export function formatSkillMarkdown(input: SkillSynthesisInput): string {
  const paramsStr = JSON.stringify(input.parameters ?? {}, null, 2);
  const nowStr = new Date().toISOString();

  return `---
name: ${input.name}
description: "${input.description.replace(/"/g, '\\"')}"
version: 1.0.0
author: ${input.authorDot || "autonomous-dot"}
created_at: ${nowStr}
---

# ${input.name}

## Overview
${input.description}

## Usage Example
${input.exampleUsage || "Called automatically by the agent loop when matching intent."}

## Schema Definition
\`\`\`json
${paramsStr}
\`\`\`

## Executable Logic
\`\`\`javascript
${input.code.trim()}
\`\`\`
`;
}

/**
 * Synthesizes a skill:
 * 1. Creates/Updates `/skills/<name>/SKILL.md` in the encrypted vault
 * 2. Installs the live executable tool into `custom_skills` table
 */
export async function synthesizeSkill(
  ctx: VaultCtx,
  input: SkillSynthesisInput,
): Promise<{ success: boolean; message: string; vaultPath: string }> {
  const safeName = input.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const vaultPath = `/skills/${safeName}/SKILL.md`;
  const markdown = formatSkillMarkdown({ ...input, name: safeName });

  try {
    // 1. Save SKILL.md in encrypted vault
    const existing = getMeta(ctx, vaultPath);
    if (!existing || existing.deletedAt) {
      createFile(ctx, vaultPath);
    }
    writeFile(ctx, vaultPath, markdown);

    // 2. Register executable skill in SQLite table
    const installResult = await toolInstallSkill(
      {
        name: safeName,
        description: input.description,
        parameters: input.parameters,
        code: input.code,
      },
      ctx as unknown as { db: Database.Database },
    );

    return {
      success: true,
      message: `✔ Skill "${safeName}" synthesized successfully!\n- Vault Doc: ${vaultPath}\n- Live Tool: Registered and active.\n${installResult}`,
      vaultPath,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to synthesize skill "${safeName}": ${err instanceof Error ? err.message : String(err)}`,
      vaultPath,
    };
  }
}
