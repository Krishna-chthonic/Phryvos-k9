/**
 * Shared risk levels and path containment utilities.
 * Client-safe: does NOT import any Node.js built-ins.
 */

export enum ToolRiskLevel {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export function getToolRiskLevel(toolName: string): ToolRiskLevel {
  const name = toolName.toLowerCase();
  if (
    name === "terminal" ||
    name === "bash" ||
    name.includes("delete_database") ||
    name.includes("drop_") ||
    name.includes("destroy") ||
    name.includes("exec")
  ) {
    return ToolRiskLevel.CRITICAL;
  }

  if (
    name.includes("write") ||
    name.includes("create") ||
    name.includes("delete") ||
    name.includes("remove") ||
    name.includes("patch") ||
    name.includes("update") ||
    name.includes("move")
  ) {
    return ToolRiskLevel.HIGH;
  }

  if (
    name.includes("fetch") ||
    name.includes("search") ||
    name.includes("network") ||
    name.includes("download")
  ) {
    return ToolRiskLevel.MEDIUM;
  }

  return ToolRiskLevel.LOW;
}

export function checkPathContainment(
  pathToCheck: string,
  baseDir = "/root/phryvos-k9",
): { allowed: boolean; reason?: string } {
  if (!pathToCheck || typeof pathToCheck !== "string") {
    return { allowed: false, reason: "Path cannot be empty" };
  }

  const normalized = pathToCheck.replace(/\\/g, "/");

  // Check for traversal
  if (
    normalized.includes("../") ||
    normalized.includes("/..") ||
    normalized === ".."
  ) {
    return { allowed: false, reason: "Directory traversal sequences (..) are forbidden" };
  }

  // Check for sensitive OS and repository internals
  const lower = normalized.toLowerCase();
  const forbiddenPrefixes = [
    "/etc",
    "/proc",
    "/sys",
    "/dev",
    "/boot",
    "/var/run",
    "/root/.ssh",
    "/root/.gnupg",
  ];

  for (const prefix of forbiddenPrefixes) {
    if (lower === prefix || lower.startsWith(prefix + "/")) {
      return { allowed: false, reason: `Access to system directory ${prefix} is restricted` };
    }
  }

  if (lower.includes(".git/") || lower.endsWith("/.git") || lower === ".git") {
    return { allowed: false, reason: "Direct modification of .git directory is forbidden" };
  }

  return { allowed: true };
}
