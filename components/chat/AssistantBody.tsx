"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { parseThinking, ThinkingAccordion } from "./ThinkingAccordion";
import type { StepEvt } from "./types";

export function AssistantBody({
  body,
  streaming,
  elapsed,
  liveSteps,
  toolCalls,
}: {
  body: string;
  streaming?: boolean;
  elapsed?: number;
  liveSteps?: StepEvt[];
  toolCalls?: Array<{ name: string }> | null;
}) {
  const { thinking, answer, isThinkingLive } = parseThinking(body);

  if (!body && streaming) {
    return (
      <ThinkingAccordion
        thinking=""
        isLive={true}
        elapsed={elapsed}
        liveSteps={liveSteps}
        toolCalls={toolCalls}
      />
    );
  }

  return (
    <div className="text-sm">
      {(thinking ||
        (streaming && isThinkingLive) ||
        (liveSteps && liveSteps.length > 0)) && (
        <ThinkingAccordion
          thinking={thinking ?? ""}
          isLive={streaming && (isThinkingLive || !answer)}
          elapsed={elapsed}
          liveSteps={liveSteps}
          toolCalls={toolCalls}
        />
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
