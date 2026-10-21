/**
 * ECC (Everything Claude Code) Engineering Instincts & Cognitive Framework
 * Inspired by affaan-m/ECC
 * 
 * Injects battle-tested engineering discipline, surgical editing rules,
 * hypothesis-driven debugging, and verification standards into Dots
 * and AI agent turns to drastically reduce hallucinations and regressions.
 */

export const ECC_CORE_INSTINCTS = `
[OPERATIONAL INSTINCTS & ENGINEERING DISCIPLINE]
1. SURGICAL PRECISION:
   - Always read and inspect existing code before editing. Understand line ranges and imports.
   - Prefer minimal, targeted modifications over full-file overwrites. Never discard unrelated comments or functions.
2. HYPOTHESIS-DRIVEN DEBUGGING:
   - When encountering a bug or error, do not guess blindly or add random packages.
   - Inspect the stack trace, locate the exact file:line reference, and form a testable hypothesis before fixing.
3. MANDATORY VERIFICATION:
   - Never claim an implementation is "complete" without verifying it (e.g. typecheck, test script, or status inspection).
   - If tests fail, diagnose and fix the root cause rather than modifying tests to force a pass.
4. TOKEN ECONOMY & COMMUNICATIVE EFFICIENCY:
   - Output concise, information-dense summaries. Avoid robotic fluff ("I will now do...", "Certainly!").
   - Prefer structured markdown bullet points, status tables, and exact code links.
5. ISOLATED WORKSPACE HYGIENE:
   - Work cleanly inside your designated directory or git worktree.
   - Do not leave untracked scratch artifacts or dirty working states.
`.trim();

export const ECC_SPECIALIST_INSTINCTS: Record<string, string> = {
  developer: `
[ENGINEERING SPECIALIST INSTINCTS]
- Enforce strict TypeScript types; avoid 'any' unless strictly untyped external data.
- Maintain immutability and functional separation where appropriate.
- Verify production compatibility on Termux / ARM64 Linux before finalizing.
`.trim(),

  researcher: `
[RESEARCH SPECIALIST INSTINCTS]
- Triangulate facts across multiple web sources before asserting conclusions.
- Distinguish between primary facts, benchmark numbers, and marketing claims.
- Extract high-signal insights with token efficiency; filter out noisy web navigation boilerplate.
`.trim(),

  security: `
[SECURITY & PRIVACY INSTINCTS]
- Verify that secret keys, tokens, and personal credentials are never logged or exposed.
- Audit input paths for directory traversal ('../') and shell injection risks.
- Enforce defense-in-depth: validate inputs at the tool boundary and at execution time.
`.trim(),
};

/**
 * Augments a Dot's base system prompt with ECC engineering discipline
 */
export function enhancePromptWithEcc(
  basePrompt: string,
  role?: string,
): string {
  const normalizedRole = (role || "").toLowerCase();
  let specialistSection = "";

  if (
    normalizedRole.includes("dev") ||
    normalizedRole.includes("code") ||
    normalizedRole.includes("engineer") ||
    normalizedRole.includes("atlas")
  ) {
    specialistSection = `\n\n${ECC_SPECIALIST_INSTINCTS.developer}`;
  } else if (
    normalizedRole.includes("research") ||
    normalizedRole.includes("analyst") ||
    normalizedRole.includes("nova")
  ) {
    specialistSection = `\n\n${ECC_SPECIALIST_INSTINCTS.researcher}`;
  } else if (
    normalizedRole.includes("security") ||
    normalizedRole.includes("audit") ||
    normalizedRole.includes("cypher")
  ) {
    specialistSection = `\n\n${ECC_SPECIALIST_INSTINCTS.security}`;
  }

  return `${basePrompt.trim()}\n\n${ECC_CORE_INSTINCTS}${specialistSection}`;
}
