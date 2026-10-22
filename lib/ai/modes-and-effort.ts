/**
 * AI Modes and Effort Configuration System for phryvos-k9.
 *
 * Supported Effort Levels:
 * - low, medium, high, max, xhigh, ultra
 *
 * Supported Modes:
 * - thinking: Deep reasoning for 5-15 minutes on complex math, science, and logic.
 * - flash: Instant response with minimal latency and direct answers.
 * - research: Autonomous deep research up to 2 hours, auto-approving tools, producing massive reports.
 * - coding: Full-stack software architecture, debugging, and execution.
 * - creative: Rich long-form writing, storytelling, and brainstorming.
 * - study: Socratic academic tutoring, exam prep, and KaTeX math derivations.
 * - general: Balanced standard assistant.
 */

export type EffortLevel = "low" | "medium" | "high" | "max" | "xhigh" | "ultra";

export type AiMode =
  | "thinking"
  | "flash"
  | "research"
  | "coding"
  | "creative"
  | "study"
  | "general";

export interface EffortMetadata {
  id: EffortLevel;
  name: string;
  badge: string;
  description: string;
  color: string;
  maxSteps: number;
  providerTimeoutMs: number;
  reasoningEffort: "low" | "medium" | "high";
  thinkingBudget: number;
  temperature: number;
  systemModifier: string;
}

export interface ModeMetadata {
  id: AiMode;
  name: string;
  shortName: string;
  badge: string;
  description: string;
  icon: string;
  color: string;
  autoApproveTools: boolean;
  minTimeoutMs: number;
  minSteps: number;
  systemInstructions: string;
}

export const EFFORT_PRESETS: Record<EffortLevel, EffortMetadata> = {
  low: {
    id: "low",
    name: "Low Effort",
    badge: "Low",
    description: "Fast, minimal deliberation, direct answers",
    color: "text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800",
    maxSteps: 6,
    providerTimeoutMs: 60_000,
    reasoningEffort: "low",
    thinkingBudget: 1024,
    temperature: 0.3,
    systemModifier:
      "EFFORT LEVEL: LOW. Be direct, clear, and concise. Omit redundant exploration or excessive deliberation.",
  },
  medium: {
    id: "medium",
    name: "Medium Effort",
    badge: "Medium",
    description: "Standard balanced reasoning and thoroughness",
    color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40",
    maxSteps: 15,
    providerTimeoutMs: 180_000,
    reasoningEffort: "medium",
    thinkingBudget: 4096,
    temperature: 0.6,
    systemModifier:
      "EFFORT LEVEL: MEDIUM. Provide balanced, coherent, and well-explained reasoning.",
  },
  high: {
    id: "high",
    name: "High Effort",
    badge: "High",
    description: "Deep multi-step reasoning, verifies edge cases",
    color: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40",
    maxSteps: 35,
    providerTimeoutMs: 360_000,
    reasoningEffort: "high",
    thinkingBudget: 16384,
    temperature: 0.7,
    systemModifier:
      "EFFORT LEVEL: HIGH. Think deeply through multiple perspectives, examine edge cases, and rigorously cross-verify your findings.",
  },
  max: {
    id: "max",
    name: "Max Effort",
    badge: "Max",
    description: "Exhaustive critical deliberation (5-10 mins)",
    color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40",
    maxSteps: 60,
    providerTimeoutMs: 600_000,
    reasoningEffort: "high",
    thinkingBudget: 32768,
    temperature: 0.7,
    systemModifier:
      "EFFORT LEVEL: MAX. Dedicate extensive critical deliberation. Plan meticulously, simulate outcomes, and construct an airtight solution.",
  },
  xhigh: {
    id: "xhigh",
    name: "X-High Effort",
    badge: "X-High",
    description: "Extreme depth & self-critique (10-15 mins)",
    color: "text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-950/40",
    maxSteps: 90,
    providerTimeoutMs: 900_000,
    reasoningEffort: "high",
    thinkingBudget: 65536,
    temperature: 0.7,
    systemModifier:
      "EFFORT LEVEL: EXTRA HIGH (XHIGH). Perform exhaustive multi-stage analysis with formal proof, systematic self-critique, and comprehensive verification.",
  },
  ultra: {
    id: "ultra",
    name: "Ultra Effort",
    badge: "Ultra",
    description: "Ultimate unbounded depth & proof (15-30+ mins)",
    color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700",
    maxSteps: 150,
    providerTimeoutMs: 1800_000,
    reasoningEffort: "high",
    thinkingBudget: 131072,
    temperature: 0.7,
    systemModifier:
      "EFFORT LEVEL: ULTRA. Unleash ultimate analytical depth. Deconstruct the problem from foundational first-principles, simulate scenarios, verify all edge cases, and construct a master-level authoritative solution.",
  },
};

export const MODE_PRESETS: Record<AiMode, ModeMetadata> = {
  thinking: {
    id: "thinking",
    name: "Reasoning & Deep Think",
    shortName: "Reasoning",
    badge: "5-15m Think",
    description: "Deep 5-15 min reasoning for complex math, science, and logic",
    icon: "Brain",
    color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800",
    autoApproveTools: false,
    minTimeoutMs: 900_000, // 15 mins
    minSteps: 50,
    systemInstructions: `<mode_directive>
MODE: DEEP REASONING & EXTENDED THINKING
1. The user has explicitly selected extended reasoning mode for this task. You have up to 15 minutes of uninterrupted deliberation.
2. DO NOT rush to a conclusion. Always wrap your deep reasoning in <think>...</think> tags.
3. Systematically structure your reasoning process:
   - Phase 1 (Deconstruction): Clarify assumptions, extract constraints, and break into atomic sub-problems.
   - Phase 2 (Exploration): Generate at least 2 distinct candidate approaches/theorems.
   - Phase 3 (Rigorous Derivation): Execute each step with mathematical, logical, and empirical rigor.
   - Phase 4 (Self-Critique): Actively search for flaws, counter-examples, edge cases, and arithmetic errors.
   - Phase 5 (Synthesis): Formulate the final definitive solution clearly.
4. If working on mathematical derivations, use KaTeX formatted LaTeX ($...$ and $$...$$).
</mode_directive>`,
  },
  flash: {
    id: "flash",
    name: "Flash Speed",
    shortName: "Flash",
    badge: "Fast",
    description: "Ultra-fast response with zero latency overhead",
    icon: "Zap",
    color: "text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800",
    autoApproveTools: false,
    minTimeoutMs: 45_000,
    minSteps: 3,
    systemInstructions: `<mode_directive>
MODE: FLASH SPEED
1. Deliver ultra-fast, direct, and concise answers immediately.
2. Omit intros, conversational filler, rhetorical summaries, and redundant preamble.
3. If code or mathematical formula is needed, output it directly with minimal commentary.
</mode_directive>`,
  },
  research: {
    id: "research",
    name: "Autonomous Deep Research",
    shortName: "Deep Research",
    badge: "Autonomous (2 hrs)",
    description: "Deep research synthesis up to 2 hours with extensive tool iterations",
    icon: "Globe",
    color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800",
    autoApproveTools: false,
    minTimeoutMs: 7200_000, // 2 hours
    minSteps: 120,
    systemInstructions: `<mode_directive>
MODE: AUTONOMOUS DEEP RESEARCH & DOSSIER GENERATION
1. AUTONOMOUS PERMISSIONS: You are granted FULL AUTONOMOUS EXECUTION. All research, web search, web fetch, pdf reading, file writing, data analysis, python execution, and skill management tools are PRE-APPROVED and run automatically without stopping to request confirmation.
2. EXTENDED TIMEOUT: You have an extended execution budget of up to 2 hours and over 100 tool iterations.
3. MASSIVE SCALE SYNTHESIS:
   - For extensive research topics, write the complete, unabridged, comprehensive research report directly into a vault file using \`write_file\` (e.g. \`research/<topic-slug>-report.md\`).
   - The file can span thousands of lines / up to hundreds or 1000 pages of deep documentation, structured into sections: Executive Summary, Historical Background, Methodology, Deep-Dive Analysis, Empirical Data & Tables, Cross-Disciplinary Perspectives, and Annotated Citations.
   - Do NOT prematurely stop or truncate. Gather real data using web search/fetch, synthesize thoroughly, and save the document.
4. IN THE CHAT RESPONSE:
   - Provide an executive briefing summarizing key findings.
   - Provide a direct markdown file link to the generated document in the vault (e.g., \`[Read Full Research Report](vault:///research/<topic-slug>-report.md)\`).
5. LIVE WEB GROUNDING: ALWAYS search the live web using \`web_search\` and fetch authoritative pages using \`web_fetch\` to gather current, factual, and verified real-world data rather than relying on stale memory.
</mode_directive>`,
  },
  coding: {
    id: "coding",
    name: "Full-Stack Coding & Architecture",
    shortName: "Coding",
    badge: "Code",
    description: "Production code generation, bug fixing, test running, and file editing",
    icon: "Terminal",
    color: "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-300 dark:border-cyan-800",
    autoApproveTools: false,
    minTimeoutMs: 300_000,
    minSteps: 40,
    systemInstructions: `<mode_directive>
MODE: FULL-STACK CODING & ARCHITECTURE
1. Focus on clean, production-grade, modular, and type-safe code.
2. When creating or editing files, ensure correct directory structure and zero placeholder syntax.
3. Handle error cases, edge conditions, security boundaries, and async state thoroughly.
4. Use \`run_code\` to test snippets or verify logic when applicable.
</mode_directive>`,
  },
  creative: {
    id: "creative",
    name: "Creative & Long-form Writer",
    shortName: "Creative",
    badge: "Creative",
    description: "Rich storytelling, prose, screenplays, and conceptual essays",
    icon: "PenTool",
    color: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800",
    autoApproveTools: false,
    minTimeoutMs: 240_000,
    minSteps: 20,
    systemInstructions: `<mode_directive>
MODE: CREATIVE & LONG-FORM WRITER
1. Employ evocative, literary, and expressive language.
2. Focus on rich character voices, worldbuilding, atmospheric pacing, and emotional resonance.
3. Avoid generic AI clichés and predictable formulaic phrasing.
</mode_directive>`,
  },
  study: {
    id: "study",
    name: "Study & Socratic Exam Prep",
    shortName: "Study Tutor",
    badge: "JEE/Exam",
    description: "Socratic tutoring, KaTeX math derivations, and active recall coaching",
    icon: "GraduationCap",
    color: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-800",
    autoApproveTools: false,
    minTimeoutMs: 300_000,
    minSteps: 30,
    systemInstructions: `<mode_directive>
MODE: STUDY TUTOR & EXAM PREPARATION
1. Apply Socratic teaching techniques: break complex topics into intuitive first-principles.
2. Format all physics and mathematical expressions using clean KaTeX LaTeX syntax ($...$ inline, $$...$$ display).
3. Simplify intermediate calculations so numbers and units are immediately understandable.
4. Conclude with a quick conceptual check or active recall question to verify retention.
</mode_directive>`,
  },
  general: {
    id: "general",
    name: "General Assistant",
    shortName: "General",
    badge: "Standard",
    description: "Balanced versatile assistant for everyday tasks",
    icon: "Sparkles",
    color: "text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700",
    autoApproveTools: false,
    minTimeoutMs: 180_000,
    minSteps: 15,
    systemInstructions: `<mode_directive>
MODE: GENERAL ASSISTANT
Provide clear, helpful, accurate, and comprehensive responses across all topics.
</mode_directive>`,
  },
};

export interface ResolvedLimits {
  minSteps: number;
  maxSteps: number;
  providerTimeoutMs: number;
  autoApproveTools: boolean;
  systemPrompt: string;
  turnOptions: {
    reasoningEffort: "low" | "medium" | "high";
    thinkingBudget: number;
    temperature?: number;
    timeoutMs: number;
  };
}

export function resolveExecutionLimits(
  mode: AiMode = "general",
  effort: EffortLevel = "medium",
): ResolvedLimits {
  const effortMeta = EFFORT_PRESETS[effort] ?? EFFORT_PRESETS.medium;
  const modeMeta = MODE_PRESETS[mode] ?? MODE_PRESETS.general;

  let maxSteps = Math.max(effortMeta.maxSteps, modeMeta.minSteps);
  let timeoutMs = Math.max(effortMeta.providerTimeoutMs, modeMeta.minTimeoutMs);
  let reasoningEffort = effortMeta.reasoningEffort;
  let thinkingBudget = effortMeta.thinkingBudget;
  let temperature = effortMeta.temperature;

  if (mode === "flash") {
    maxSteps = 3;
    timeoutMs = 45_000;
    reasoningEffort = "low";
    thinkingBudget = 1024;
    temperature = 0.2;
  } else if (mode === "thinking") {
    timeoutMs = Math.max(timeoutMs, 900_000); // at least 15 min
    maxSteps = Math.max(maxSteps, 60);
    reasoningEffort = "high";
    thinkingBudget = Math.max(thinkingBudget, 32768);
  } else if (mode === "research") {
    timeoutMs = Math.max(timeoutMs, 7200_000); // up to 2 hours
    maxSteps = Math.max(maxSteps, 120);
    reasoningEffort = "high";
    thinkingBudget = Math.max(thinkingBudget, 32768);
  } else if (mode === "creative") {
    temperature = 0.85;
  }

  const systemPrompt = [modeMeta.systemInstructions, effortMeta.systemModifier].join("\n\n");

  return {
    minSteps: modeMeta.minSteps,
    maxSteps,
    providerTimeoutMs: timeoutMs,
    autoApproveTools: modeMeta.autoApproveTools,
    systemPrompt,
    turnOptions: {
      reasoningEffort,
      thinkingBudget,
      temperature,
      timeoutMs,
    },
  };
}
