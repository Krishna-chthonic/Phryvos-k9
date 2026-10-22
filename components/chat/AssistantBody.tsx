"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { parseThinking, ThinkingAccordion } from "./ThinkingAccordion";
import { ActivityTimeline, type ActivityStep } from "./ActivityTimeline";
import { SourcesUsedPanel, type VaultSourceCitation } from "./SourcesUsedPanel";
import type { StepEvt } from "./types";

export function AssistantBody({
  body,
  streaming,
  elapsed,
  liveSteps,
  toolCalls,
  sources,
  onOpenVaultFile,
}: {
  body: string;
  streaming?: boolean;
  elapsed?: number;
  liveSteps?: StepEvt[];
  toolCalls?: Array<{ name?: string; function?: { name?: string; arguments?: string }; arguments?: any }> | null;
  sources?: VaultSourceCitation[];
  onOpenVaultFile?: (filePath: string) => void;
}) {
  const { thinking, answer, isThinkingLive } = parseThinking(body);

  const hasThinking = Boolean(
    thinking || (streaming && isThinkingLive)
  );

  const isLive = Boolean(streaming && (isThinkingLive || (!answer && hasThinking)));

  // Map liveSteps or toolCalls into ActivitySteps for the timeline (CHAT-33)
  let activitySteps: ActivityStep[] = [];
  if (liveSteps && liveSteps.length > 0) {
    activitySteps = liveSteps.map((s) => ({
      step: s.step,
      toolCallId: s.toolCallId,
      tool: s.tool,
      args: s.args,
      result: s.result,
      approval: s.approval,
      status: s.result ? "success" : "running",
    }));
  } else if (toolCalls && toolCalls.length > 0) {
    activitySteps = toolCalls.map((tc, idx) => {
      const toolName = tc.name || tc.function?.name || "tool";
      let argsObj: Record<string, any> = {};
      const rawArgs = tc.arguments || tc.function?.arguments;
      if (typeof rawArgs === "string") {
        try {
          argsObj = JSON.parse(rawArgs);
        } catch {
          argsObj = { raw: rawArgs };
        }
      } else if (rawArgs && typeof rawArgs === "object") {
        argsObj = rawArgs;
      }
      return {
        step: idx + 1,
        tool: toolName,
        args: argsObj,
        status: "success",
      };
    });
  }

  if (!body && streaming) {
    return (
      <div className="space-y-2">
        <ThinkingAccordion
          thinking=""
          isLive={true}
          elapsed={elapsed}
          liveSteps={liveSteps}
          toolCalls={toolCalls as any}
        />
        {activitySteps.length > 0 && (
          <ActivityTimeline steps={activitySteps} defaultExpanded={true} />
        )}
      </div>
    );
  }

  return (
    <div className="text-sm">
      {hasThinking && (
        <ThinkingAccordion
          thinking={thinking ?? ""}
          isLive={isLive}
          elapsed={elapsed}
          liveSteps={liveSteps}
          toolCalls={toolCalls as any}
        />
      )}

      {/* Collapsible Activity Timeline for Tool Executions (CHAT-33) */}
      {activitySteps.length > 0 && (
        <ActivityTimeline steps={activitySteps} defaultExpanded={Boolean(streaming)} />
      )}

      {/* Cited Sources Panel (CHAT-28) */}
      {sources && sources.length > 0 && (
        <SourcesUsedPanel sources={sources} onOpenVaultFile={onOpenVaultFile} />
      )}

      {answer ? (
        <MarkdownRenderer>{answer}</MarkdownRenderer>
      ) : streaming && thinking ? (
        <div className="flex items-center gap-2 pt-2 text-xs text-zinc-400 italic">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
          <span>Formulating final response...</span>
        </div>
      ) : null}
    </div>
  );
}
