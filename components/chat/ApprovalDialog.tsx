"use client";

import React, { useState, useEffect } from "react";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import type { ApprovalReq } from "./types";
import { Button } from "@/components/ui/button";

export function ApprovalDialog({
  approval,
  onResolve,
  resolving,
}: {
  approval: ApprovalReq;
  onResolve: (id: string, decision: "allow" | "deny") => void;
  resolving: boolean;
}) {
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes TTL (300 seconds)

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onResolve(approval.approvalId, "deny");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [approval.approvalId, onResolve]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeString = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  return (
    <div className="mx-auto mb-3 w-full max-w-[560px] rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--bg-1)] p-3.5 shadow-none select-none">
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
          <ShieldCheck className="h-4 w-4 stroke-[1.5]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--text-sm)] font-medium text-[var(--fg-0)]">
              {approval.tool ? `Tool Call: ${approval.tool}` : "Approval Required"}
            </span>
            <span className="text-[11px] font-mono text-[var(--fg-2)]">
              TTL {timeString}
            </span>
          </div>
          <p className="mt-1 text-[var(--text-xs)] text-[var(--fg-1)] leading-relaxed">
            {approval.description || "The agent is requesting permission to execute this action."}
          </p>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={resolving}
          onClick={() => onResolve(approval.approvalId, "deny")}
        >
          Deny
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={resolving}
          onClick={() => onResolve(approval.approvalId, "allow")}
        >
          Approve Action
        </Button>
      </div>
    </div>
  );
}
