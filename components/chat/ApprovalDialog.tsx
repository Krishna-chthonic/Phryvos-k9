"use client";

import React from "react";
import { ShieldAlert } from "lucide-react";
import type { ApprovalReq } from "./types";

export function ApprovalDialog({
  approval,
  onResolve,
  resolving,
}: {
  approval: ApprovalReq;
  onResolve: (id: string, decision: "allow" | "deny") => void;
  resolving: boolean;
}) {
  return (
    <div className="mx-auto mb-3 w-full max-w-5xl rounded-2xl border border-amber-300 bg-amber-50 p-3.5 shadow-xs dark:border-amber-800/80 dark:bg-amber-950/40">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-amber-950 dark:text-amber-200">
            {approval.description}
          </div>
          <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
            The AI agent wants to execute a sensitive action. Auto-denies in 5
            minutes if unapproved.
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => onResolve(approval.approvalId, "deny")}
            disabled={resolving}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 cursor-pointer dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Deny
          </button>
          <button
            onClick={() => onResolve(approval.approvalId, "allow")}
            disabled={resolving}
            className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-40 shadow-xs cursor-pointer dark:bg-amber-500"
          >
            {resolving ? "…" : "Allow"}
          </button>
        </div>
      </div>
    </div>
  );
}
