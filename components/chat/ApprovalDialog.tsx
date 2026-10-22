"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ShieldCheck, AlertTriangle, ShieldAlert, CheckCircle2, FileCode } from "lucide-react";
import type { ApprovalReq } from "./types";
import { Button } from "@/components/ui/button";
import { getToolRiskLevel, checkPathContainment, ToolRiskLevel } from "@/lib/agent/risk";

export function ApprovalDialog({
  approval,
  onResolve,
  resolving,
  error,
  onDismiss,
}: {
  approval: ApprovalReq;
  onResolve: (id: string, decision: "allow" | "deny") => void;
  resolving: boolean;
  error?: string | null;
  onDismiss?: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes TTL (300 seconds)
  const [isExpired, setIsExpired] = useState(false);

  // Reset timer whenever a new approvalId is received
  useEffect(() => {
    setTimeLeft(300);
    setIsExpired(false);
  }, [approval.approvalId]);

  useEffect(() => {
    if (isExpired) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [approval.approvalId, isExpired]);

  // Handle expiration side-effect purely outside render/state updater
  useEffect(() => {
    if (timeLeft === 0 && !isExpired) {
      setIsExpired(true);
      onResolve(approval.approvalId, "deny");
    }
  }, [timeLeft, isExpired, approval.approvalId, onResolve]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeString = `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;

  // Risk Level Assessment
  const riskLevel = useMemo(() => {
    return getToolRiskLevel(approval.tool || "");
  }, [approval.tool]);

  // Path Containment Verification
  const pathCheck = useMemo(() => {
    const rawPath =
      approval.args?.path ||
      approval.args?.filePath ||
      approval.args?.target ||
      approval.args?.file;
    if (typeof rawPath === "string") {
      return checkPathContainment(rawPath);
    }
    return null;
  }, [approval.args]);

  // File write diff preview
  const fileDiffPreview = useMemo(() => {
    if (
      approval.tool === "write_file" ||
      approval.tool === "create_file" ||
      approval.tool === "patch_file"
    ) {
      const content = approval.args?.content || approval.args?.patch || approval.args?.diff;
      if (typeof content === "string") {
        return content.slice(0, 1000);
      }
    }
    return null;
  }, [approval.tool, approval.args]);

  const argsPreview =
    approval.args && Object.keys(approval.args).length > 0 && !fileDiffPreview
      ? JSON.stringify(approval.args, null, 2)
      : null;

  const riskBadge = {
    [ToolRiskLevel.CRITICAL]: "bg-red-500/15 text-red-400 border-red-500/30",
    [ToolRiskLevel.HIGH]: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    [ToolRiskLevel.MEDIUM]: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    [ToolRiskLevel.LOW]: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  }[riskLevel];

  return (
    <div className="mx-auto mb-3 w-full max-w-[560px] rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--bg-1)] p-3.5 shadow-md select-none transition-all">
      <div className="flex items-start gap-3">
        <div className={`p-1.5 rounded-[var(--radius-sm)] shrink-0 ${
          riskLevel === ToolRiskLevel.CRITICAL || error
            ? "bg-red-500/10 text-red-500"
            : riskLevel === ToolRiskLevel.HIGH
              ? "bg-amber-500/10 text-amber-500"
              : "bg-[var(--accent-soft)] text-[var(--accent)]"
        }`}>
          {riskLevel === ToolRiskLevel.CRITICAL || error ? (
            <ShieldAlert className="h-4 w-4 stroke-[1.5]" />
          ) : (
            <ShieldCheck className="h-4 w-4 stroke-[1.5]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-sm)] font-medium text-[var(--fg-0)]">
                {approval.tool ? `Tool Approval: ${approval.tool}` : "Action Approval Required"}
              </span>
              <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${riskBadge}`}>
                {riskLevel} risk
              </span>
            </div>
            <span className={`text-[11px] font-mono ${isExpired ? "text-red-500 font-semibold" : "text-[var(--fg-2)]"}`}>
              {isExpired ? "EXPIRED" : `TTL ${timeString}`}
            </span>
          </div>

          <p className="mt-1 text-[var(--text-xs)] text-[var(--fg-1)] leading-relaxed">
            {approval.description || "The agent is requesting permission to execute this action."}
          </p>

          {/* Path Containment Alert */}
          {pathCheck && (
            <div className={`mt-2 flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-mono ${
              pathCheck.allowed
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-red-500/15 text-red-400 border border-red-500/30"
            }`}>
              {pathCheck.allowed ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Path contained inside safe repository boundaries</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Path containment violation: {pathCheck.reason}</span>
                </>
              )}
            </div>
          )}

          {/* File write diff preview */}
          {fileDiffPreview && (
            <div className="mt-2 rounded bg-zinc-900/40 border border-zinc-800 p-2 text-[11px] font-mono text-[var(--fg-2)]">
              <div className="flex items-center gap-1.5 text-neutral-400 mb-1 border-b border-zinc-800 pb-1">
                <FileCode className="h-3.5 w-3.5" />
                <span>File Write Preview ({String(approval.args?.path || approval.args?.filePath || "file")})</span>
              </div>
              <pre className="whitespace-pre-wrap max-h-32 overflow-y-auto text-emerald-300">
                {fileDiffPreview}
              </pre>
            </div>
          )}

          {argsPreview && (
            <div className="mt-2 rounded bg-zinc-900/5 dark:bg-zinc-950/60 p-2 text-[11px] font-mono text-[var(--fg-2)] overflow-x-auto max-h-24">
              <pre className="whitespace-pre-wrap">{argsPreview}</pre>
            </div>
          )}

          {error && (
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded bg-red-500/10 p-2 text-[11px] text-red-600 dark:text-red-400">
              <div className="flex items-center gap-1.5 min-w-0">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{error}</span>
              </div>
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="shrink-0 text-red-500 hover:underline font-medium"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
        {isExpired ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        ) : (
          <>
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
              {error ? "Retry Approval" : "Approve Action"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
