import fs from "node:fs";
import path from "node:path";

export interface TerminalWorkingDirResult {
  ok: boolean;
  resolvedPath?: string;
  error?: string;
}

const RESTRICTED_SYSTEM_DIRS = [
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

/**
 * Validates and confines terminal execution working directory to a Dot's sandbox.
 * Defends against path traversal, symlink escapes, and restricted OS directories.
 */
export function validateTerminalWorkingDir(
  baseWorkspace: string,
  requestedSubpath?: string
): TerminalWorkingDirResult {
  if (!baseWorkspace || typeof baseWorkspace !== "string") {
    return { ok: false, error: "Base workspace path is required" };
  }

  // Ensure base directory exists or can be resolved
  let resolvedBase: string;
  try {
    if (!fs.existsSync(baseWorkspace)) {
      fs.mkdirSync(baseWorkspace, { recursive: true });
    }
    resolvedBase = fs.realpathSync(path.resolve(baseWorkspace));
  } catch (err) {
    return { ok: false, error: `Failed to resolve base workspace: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (!requestedSubpath || requestedSubpath.trim() === "") {
    return { ok: true, resolvedPath: resolvedBase };
  }

  // Defend against null bytes
  if (requestedSubpath.includes("\0")) {
    return { ok: false, error: "Invalid path: null bytes rejected" };
  }

  // Target path resolution
  let candidatePath: string;
  if (path.isAbsolute(requestedSubpath)) {
    candidatePath = path.resolve(requestedSubpath);
  } else {
    candidatePath = path.resolve(resolvedBase, requestedSubpath);
  }

  // Check if candidate exists; if not, check parent directory
  let realCandidate: string;
  try {
    if (fs.existsSync(candidatePath)) {
      realCandidate = fs.realpathSync(candidatePath);
    } else {
      // If it doesn't exist yet, normalize candidate
      realCandidate = candidatePath;
    }
  } catch {
    realCandidate = candidatePath;
  }

  // Check against restricted OS system paths
  for (const sysDir of RESTRICTED_SYSTEM_DIRS) {
    if (realCandidate === sysDir || realCandidate.startsWith(`${sysDir}/`)) {
      return { ok: false, error: `Access to restricted system directory "${sysDir}" is blocked` };
    }
  }

  // Sandboxing: verify that realCandidate is inside or equal to resolvedBase
  const relative = path.relative(resolvedBase, realCandidate);
  const isInside = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));

  if (!isInside) {
    return { ok: false, error: `Target path "${requestedSubpath}" escapes sandbox base directory "${resolvedBase}"` };
  }

  return { ok: true, resolvedPath: realCandidate };
}
