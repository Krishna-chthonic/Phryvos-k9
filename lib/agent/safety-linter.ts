/**
 * Pre-Flight Safety Linter & Behavioral Audit Engine
 * Inspired by iFixAi Agent Diagnostics & Guardrails
 * 
 * Intercepts tool calls and shell commands before execution to prevent
 * unauthorized system tampering, dangerous wipes, path traversal,
 * and indirect prompt injection attacks.
 */

export interface SafetyLintResult {
  ok: boolean;
  reason?: string;
  category?: "PATH_TRAVERSAL" | "DANGEROUS_SHELL" | "DATABASE_WIPE" | "INJECTION_ATTACK";
}

/** Paths that must never be modified or targeted by agent file/shell operations */
const RESTRICTED_SYSTEM_PATHS = [
  "/etc",
  "/proc",
  "/sys",
  "/dev",
  "/system",
  "/system/bin",
  "/init",
  "/sbin",
  "/usr/lib",
  "/var/run",
];

/** Regex patterns for catastrophic terminal commands */
const DANGEROUS_SHELL_PATTERNS: Array<{ regex: RegExp; message: string }> = [
  {
    regex: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|--force)\s+([~/]|\*|\/\*|\/\.)(\s|$)/,
    message: "Catastrophic file deletion targeting root or user directory blocked.",
  },
  {
    regex: /\bmkfs\b/i,
    message: "Disk filesystem format command (mkfs) blocked.",
  },
  {
    regex: /\bdd\s+if=\/dev\/(zero|urandom|null)\s+of=\/dev\//i,
    message: "Direct disk device overwriting blocked.",
  },
  {
    regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    message: "Fork-bomb resource exhaustion attack blocked.",
  },
  {
    regex: /\b(curl|wget)\s+[^|;]+\|\s*(ba|z|da)?sh\b/i,
    message: "Unverified remote script execution pipe (curl | bash) blocked.",
  },
  {
    regex: /\bchmod\s+(-R\s+)?777\s+(\/|\/system|\/etc|\/root)\b/,
    message: "Dangerous root-level permission modification (chmod 777) blocked.",
  },
  {
    regex: /\bfind\s+\/\s+-delete\b/i,
    message: "Global recursive file deletion via find blocked.",
  },
];

/** Regex patterns for indirect prompt injections inside untrusted arguments */
const INJECTION_PATTERNS: Array<{ regex: RegExp; message: string }> = [
  {
    regex: /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|prompts|rules)/i,
    message: "Prompt injection attempt detected: Instruction reset phrase.",
  },
  {
    regex: /\b(?:SYSTEM\s+OVERRIDE|ADMIN_OVERRIDE|JAILBREAK_ACTIVATED)\b/i,
    message: "Prompt injection attempt detected: Fake system override token.",
  },
  {
    regex: /\bYou\s+are\s+now\s+(?:DAN|unrestricted|in\s+developer\s+mode|jailbroken)\b/i,
    message: "Prompt injection attempt detected: Persona jailbreak phrase.",
  },
];

/**
 * Validates a file path to prevent directory traversal outside allowed boundaries.
 */
export function lintPath(rawPath: string): SafetyLintResult {
  if (!rawPath || typeof rawPath !== "string") {
    return { ok: true };
  }

  const normalized = rawPath.replace(/\\/g, "/");

  // Prevent parent directory traversal attempts
  if (normalized.includes("../") || normalized.includes("/..")) {
    return {
      ok: false,
      reason: `Path traversal attempt detected with parent directory references: "${rawPath}"`,
      category: "PATH_TRAVERSAL",
    };
  }

  // Prevent targeting restricted OS directories
  for (const restricted of RESTRICTED_SYSTEM_PATHS) {
    if (normalized === restricted || normalized.startsWith(`${restricted}/`)) {
      return {
        ok: false,
        reason: `Access to protected operating system directory is blocked: "${rawPath}"`,
        category: "PATH_TRAVERSAL",
      };
    }
  }

  return { ok: true };
}

/**
 * Validates a shell command string for catastrophic operations.
 */
export function lintShellCommand(command: string): SafetyLintResult {
  if (!command || typeof command !== "string") {
    return { ok: true };
  }

  const trimmed = command.trim();

  // 1. Check dangerous shell patterns
  for (const { regex, message } of DANGEROUS_SHELL_PATTERNS) {
    if (regex.test(trimmed)) {
      return {
        ok: false,
        reason: `[iFixAi Safety Guard] ${message}`,
        category: "DANGEROUS_SHELL",
      };
    }
  }

  // 2. Check for database drop statements inside sqlite commands
  if (/\bDROP\s+TABLE\s+(vault_files|users|ai_providers|chat_sessions)\b/i.test(trimmed)) {
    return {
      ok: false,
      reason: "[iFixAi Safety Guard] Direct DROP of core vault database table is blocked.",
      category: "DATABASE_WIPE",
    };
  }

  return { ok: true };
}

/**
 * Pre-flight inspects any tool call before execution in the agent loop.
 */
export function lintToolExecution(
  toolName: string,
  args: Record<string, unknown>,
): SafetyLintResult {
  if (!args || typeof args !== "object") {
    return { ok: true };
  }

  // 1. Path checking for file operations
  const pathKeys = ["path", "from", "to", "filePath", "zipPath", "destinationDir", "cwd"];
  for (const key of pathKeys) {
    const val = args[key];
    if (typeof val === "string") {
      const pathRes = lintPath(val);
      if (!pathRes.ok) return pathRes;
    }
  }

  // 2. Command checking for terminal/bash execution tools
  if (toolName === "bash_exec" || toolName === "terminal" || toolName === "execute_command") {
    const cmd = args.command || args.cmd;
    if (typeof cmd === "string") {
      const shellRes = lintShellCommand(cmd);
      if (!shellRes.ok) return shellRes;
    }
  }

  // 3. Prompt injection detection in prompt arguments (e.g. delegation prompts or queries)
  const textKeys = ["prompt", "taskPrompt", "query", "text"];
  for (const key of textKeys) {
    const textVal = args[key];
    if (typeof textVal === "string") {
      for (const { regex, message } of INJECTION_PATTERNS) {
        if (regex.test(textVal)) {
          return {
            ok: false,
            reason: `[iFixAi Safety Guard] ${message}`,
            category: "INJECTION_ATTACK",
          };
        }
      }
    }
  }

  return { ok: true };
}
