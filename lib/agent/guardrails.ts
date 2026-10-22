import { createHash, randomUUID } from "node:crypto";

/**
 * Agent guardrails: hard limits on the tool loop so a rogue model can't
 * hang the request, grow the context, or run destructive ops unattended.
 */

export const MAX_AGENT_STEPS = 12;
/** one tool execution may run at most this long */
export const TOOL_TIMEOUT_MS = 30_000;
/** provider turn may run at most this long */
export const PROVIDER_TIMEOUT_MS = 120_000;
/** tool results are fed back to the model truncated to this many chars */
export const RESULT_CHAR_CAP = 20_000;
/** an unanswered destructive approval auto-denies after this */
export const APPROVAL_TTL_MS = 5 * 60_000;

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
    t.unref?.();
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Cap a tool result before it re-enters the model context. */
export function truncateResult(text: string, cap = RESULT_CHAR_CAP): string {
  if (text.length <= cap) return text;
  const head = Math.floor(cap * 0.7);
  const tail = cap - head;
  return `${text.slice(0, head)}\n… [${text.length - head - tail} chars omitted] …\n${text.slice(-tail)}`;
}

// ------------------------------------------------------------ approvals

export type ApprovalDecision = "allowed" | "denied" | "auto_denied";

export function computeActionHash(tool: string, args: Record<string, unknown>): string {
  const sorted = Object.keys(args || {})
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = args[key];
      return acc;
    }, {});
  return createHash("sha256").update(`${tool}:${JSON.stringify(sorted)}`).digest("hex");
}

export interface PendingApproval {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  actionHash: string;
  description: string;
  createdAt: number;
  state: "pending" | ApprovalDecision;
  resolver: ((d: ApprovalDecision) => void) | null;
}

// Cached on globalThis so every route bundle shares ONE approvals map
// (Next bundles lib/ modules per route; a bare module-level Map would be
// duplicated and resolveApproval would never find pending entries).
const g = globalThis as unknown as {
  __phryvosApprovals?: Map<string, PendingApproval>;
};
const approvals: Map<string, PendingApproval> = (g.__phryvosApprovals ??= new Map());

export interface ApprovalOutcome {
  decision: ApprovalDecision;
  /** human-readable, also surfaced to the model as the tool result */
  detail: string;
}

/**
 * Ask the user (via the SSE `approval` event) before a destructive tool runs.
 * Returns the pending approval's id and hash immediately; the promise resolves to
 * `auto_denied` if nobody answers within the TTL.
 */
export function requestApproval(opts: {
  tool: string;
  args: Record<string, unknown>;
  description: string;
  signal?: AbortSignal;
}): { id: string; actionHash: string; promise: Promise<ApprovalOutcome> } {
  const id = randomUUID();
  const actionHash = computeActionHash(opts.tool, opts.args);
  const entry: PendingApproval = {
    id,
    tool: opts.tool,
    args: opts.args,
    actionHash,
    description: opts.description,
    createdAt: Date.now(),
    state: "pending",
    resolver: null,
  };
  approvals.set(id, entry);

  const t = setTimeout(() => {
    entry.resolver?.("auto_denied");
  }, APPROVAL_TTL_MS);
  t.unref?.();
  if (opts.signal?.aborted) {
    settle(id, "denied");
  } else {
    opts.signal?.addEventListener(
      "abort",
      () => settle(id, "denied"),
      { once: true },
    );
  }

  const promise = new Promise<ApprovalOutcome>((resolve) => {
    entry.resolver = (d) => {
      const detail =
        d === "allowed"
          ? "User approved this operation."
          : d === "auto_denied"
            ? "User did not answer within 5 minutes — operation auto-denied. Do NOT retry; tell the user it was skipped."
            : "User denied this operation. Do NOT retry it; say it was skipped.";
      resolve({ decision: d, detail });
    };
  });
  return { id, actionHash, promise };
}

function settle(id: string, decision: ApprovalDecision): void {
  const a = approvals.get(id);
  if (!a || a.state !== "pending") return;
  a.state = decision;
  a.resolver?.(decision);
  // Auto-evict settled approval after 60s grace period to prevent unbounded memory growth while supporting idempotent retries
  const timer = setTimeout(() => {
    approvals.delete(id);
  }, 60_000);
  timer.unref?.();
}

/** called by PUT /api/chat/approvals/:id */
export function resolveApproval(
  id: string,
  decision: "allow" | "deny",
  expectedHash?: string,
): { ok: boolean; error?: string } {
  const a = approvals.get(id);
  if (!a) return { ok: false, error: "Unknown or already-resolved approval" };
  const targetState = decision === "allow" ? "allowed" : "denied";
  // Always verify expectedHash first, even on idempotent retry calls
  if (expectedHash && a.actionHash && expectedHash !== a.actionHash) {
    return { ok: false, error: "Action hash mismatch: operation parameters do not match approval" };
  }
  // Idempotent retry: if already resolved to the exact same decision, report ok: true
  if (a.state === targetState) return { ok: true };
  if (a.state !== "pending") return { ok: false, error: `Already ${a.state}` };
  settle(id, targetState);
  return { ok: true };
}

export function getApproval(id: string): PendingApproval | null {
  return approvals.get(id) ?? null;
}

export function pendingApprovals(): PendingApproval[] {
  return [...approvals.values()].filter((a) => a.state === "pending");
}

export { ToolRiskLevel, getToolRiskLevel, checkPathContainment } from "./risk";

/** test hook */
export function _clearApprovals(): void {
  approvals.clear();
}
