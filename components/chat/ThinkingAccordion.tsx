"use client";

import React, { useEffect, useRef, useState } from "react";
import { Brain, Check, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toolBadge } from "./ToolStepBadge";
import type { StepEvt } from "./types";

function getCodeSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];

  // 1. Fenced code blocks: ```...``` or ~~~...~~~
  const fenceRegex = /(?:```|~~~)[^\n]*\n[\s\S]*?(?:```|~~~|$)/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length]);
  }

  // 2. Inline code spans: `...` (not inside fenced blocks)
  const inlineRegex = /`[^`\n]+`/g;
  while ((match = inlineRegex.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    if (!spans.some(([s, e]) => start >= s && end <= e)) {
      spans.push([start, end]);
    }
  }

  return spans;
}

export function parseThinking(raw: string): {
  thinking: string | null;
  answer: string;
  isThinkingLive: boolean;
} {
  if (!raw) return { thinking: null, answer: "", isThinkingLive: false };

  const tagPatterns = [
    { open: "<think>", close: "</think>" },
    { open: "<thought>", close: "</thought>" },
    { open: "<thinking>", close: "</thinking>" },
  ];

  let currentText = raw;
  const allThoughts: string[] = [];
  let isThinkingLive = false;

  let found = true;
  while (found) {
    found = false;
    const codeSpans = getCodeSpans(currentText);
    const isInCode = (idx: number, len: number) =>
      codeSpans.some(([s, e]) => idx >= s && idx + len <= e);

    let earliestStart = -1;
    let matchingPattern: { open: string; close: string } | null = null;

    for (const pat of tagPatterns) {
      let searchPos = 0;
      while (searchPos < currentText.length) {
        const idx = currentText.toLowerCase().indexOf(pat.open, searchPos);
        if (idx === -1) break;
        if (!isInCode(idx, pat.open.length)) {
          if (earliestStart === -1 || idx < earliestStart) {
            earliestStart = idx;
            matchingPattern = pat;
          }
          break;
        }
        searchPos = idx + pat.open.length;
      }
    }

    if (earliestStart !== -1 && matchingPattern) {
      found = true;
      const afterOpen = earliestStart + matchingPattern.open.length;
      let endTagIdx = -1;
      let searchPos = afterOpen;

      while (searchPos < currentText.length) {
        const idx = currentText.toLowerCase().indexOf(matchingPattern.close, searchPos);
        if (idx === -1) break;
        if (!isInCode(idx, matchingPattern.close.length)) {
          endTagIdx = idx;
          break;
        }
        searchPos = idx + matchingPattern.close.length;
      }

      if (endTagIdx === -1) {
        // Unclosed thinking tag at the end (currently streaming live thinking)
        const liveThought = currentText.slice(afterOpen);
        if (liveThought.trim()) {
          allThoughts.push(liveThought.trim());
        }
        currentText = currentText.slice(0, earliestStart);
        isThinkingLive = true;
        break;
      } else {
        // Closed thinking block
        const thoughtContent = currentText.slice(afterOpen, endTagIdx);
        if (thoughtContent.trim()) {
          allThoughts.push(thoughtContent.trim());
        }
        currentText =
          currentText.slice(0, earliestStart) +
          currentText.slice(endTagIdx + matchingPattern.close.length);
      }
    }
  }

  // Strip dangling closing tags only outside code spans
  const finalCodeSpans = getCodeSpans(currentText);
  const isInFinalCode = (idx: number, len: number) =>
    finalCodeSpans.some(([s, e]) => idx >= s && idx + len <= e);

  const closeTagRegex = /<\/(?:think|thought|thinking)>/gi;
  let cleanText = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = closeTagRegex.exec(currentText)) !== null) {
    if (!isInFinalCode(match.index, match[0].length)) {
      cleanText += currentText.slice(lastIndex, match.index);
      lastIndex = match.index + match[0].length;
    }
  }
  cleanText += currentText.slice(lastIndex);

  const thinking = allThoughts.length > 0 ? allThoughts.join("\n\n---\n\n") : null;
  const answer = cleanText.trim();

  return { thinking, answer, isThinkingLive };
}

export function renderThinkingContent(text: string) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let textBuffer: string[] = [];

  const flushTextBuffer = (key: string) => {
    if (textBuffer.length > 0) {
      elements.push(
        <div
          key={key}
          className="whitespace-pre-wrap leading-relaxed text-zinc-600 dark:text-zinc-300 text-xs my-1"
        >
          {textBuffer.join("\n")}
        </div>,
      );
      textBuffer = [];
    }
  };

  lines.forEach((line, idx) => {
    if (line.startsWith("> 🔍 Action: ")) {
      flushTextBuffer(`buf-${idx}`);
      const rest = line.slice("> 🔍 Action: ".length);
      const match = rest.match(/^(\w+)\s*(.*)$/);
      const toolName = match ? match[1] : rest;
      const toolArg = match ? match[2] : "";
      const badge = toolBadge(toolName);
      const Icon = badge.icon;
      elements.push(
        <div
          key={`action-${idx}`}
          className="my-1.5 flex items-center gap-2 rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-3 py-1.5 text-xs text-indigo-900 dark:border-indigo-800/60 dark:bg-indigo-950/50 dark:text-indigo-200"
        >
          <Icon className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
          <span className="font-semibold">{badge.label}:</span>
          <span className="truncate max-w-sm font-mono text-[11px] text-indigo-700 dark:text-indigo-300">
            {toolArg}
          </span>
        </div>,
      );
    } else if (line.startsWith("> ✔ Completed: ")) {
      flushTextBuffer(`buf-${idx}`);
      const toolName = line.slice("> ✔ Completed: ".length).trim();
      elements.push(
        <div
          key={`comp-${idx}`}
          className="my-1 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-mono pl-2"
        >
          <Check className="h-3 w-3 shrink-0" />
          <span>Completed {toolName}</span>
        </div>,
      );
    } else {
      textBuffer.push(line);
    }
  });

  flushTextBuffer("buf-final");
  return elements;
}

export function ThinkingAccordion({
  thinking,
  isLive,
  elapsed,
  liveSteps,
  toolCalls,
}: {
  thinking: string;
  isLive?: boolean;
  elapsed?: number;
  liveSteps?: StepEvt[];
  toolCalls?: Array<{ name: string }> | null;
}) {
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const prevLiveRef = useRef(isLive);
  const words = thinking ? thinking.split(/\s+/).filter(Boolean).length : 0;
  const contentRef = useRef<HTMLDivElement | null>(null);

  // When live streaming starts, expand; when live streaming finishes, automatically collapse into compact summary
  useEffect(() => {
    if (isLive) {
      setUserToggled(true);
    } else if (prevLiveRef.current && !isLive) {
      setUserToggled(false);
    }
    prevLiveRef.current = isLive;
  }, [isLive]);

  // Keep live thoughts visible with autoscroll as tokens stream in
  useEffect(() => {
    if (isLive && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [thinking, isLive, liveSteps]);

  const expanded = userToggled !== null ? userToggled : Boolean(isLive);
  const totalTools = (liveSteps?.length ?? 0) + (toolCalls?.length ?? 0);

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-zinc-200/90 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/50 shadow-2xs">
      <button
        type="button"
        onClick={() => setUserToggled(!expanded)}
        className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs font-medium text-zinc-600 hover:bg-zinc-100/70 dark:text-zinc-400 dark:hover:bg-zinc-800/60 transition cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Brain
            className={`h-3.5 w-3.5 shrink-0 ${
              isLive
                ? "text-emerald-500 animate-pulse"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          />
          <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
            {isLive ? (
              <>
                <span>Thinking</span>
                {typeof elapsed === "number" && elapsed > 0 && (
                  <span className="font-mono text-[11px] text-zinc-500 font-normal">
                    ({elapsed}s)
                  </span>
                )}
                <span className="relative flex h-2 w-2 ml-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </>
            ) : (
              <span>
                Thought for {elapsed && elapsed > 0 ? `${elapsed}s` : `${words} words`}
                {totalTools > 0
                  ? ` · ${totalTools} ${totalTools === 1 ? "tool" : "tools"}`
                  : ""}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
          <span>{expanded ? "Collapse" : "Expand"}</span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </div>
      </button>

      {expanded && (
        <div
          ref={contentRef}
          className="border-t border-zinc-200/70 bg-white/90 p-3.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-300 max-h-80 overflow-y-auto"
        >
          {liveSteps && liveSteps.length > 0 && (
            <div className="space-y-1.5 mb-2.5">
              {liveSteps.map((s, idx) => {
                const badge = toolBadge(s.tool);
                const Icon = badge.icon;
                let argDesc = "";
                if (s.tool === "web_search")
                  argDesc = String(s.args?.query ?? "");
                else if (s.tool === "calculate")
                  argDesc = String(s.args?.expr ?? "");
                else if (s.tool === "web_fetch")
                  argDesc = String(s.args?.url ?? "");
                else if (s.args?.path) argDesc = String(s.args.path);
                else argDesc = JSON.stringify(s.args ?? {}).slice(0, 60);

                return (
                  <div
                    key={s.toolCallId || idx}
                    className="flex items-center gap-2 rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-3 py-1.5 text-xs text-zinc-800 dark:border-indigo-800/60 dark:bg-indigo-950/50 dark:text-zinc-200"
                  >
                    <Icon className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    <span className="font-semibold">{badge.label}:</span>
                    <span className="truncate max-w-xs font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      {argDesc}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3 w-3" />
                      <span>done</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {thinking ? (
            renderThinkingContent(thinking)
          ) : isLive ? (
            <div className="flex items-center gap-2 text-xs text-zinc-400 italic py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
              <span>Analyzing request and reasoning step-by-step...</span>
            </div>
          ) : null}

          {isLive && thinking && (
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
              <span className="inline-block w-1.5 h-3 bg-emerald-500 animate-pulse align-middle" />
              <span>deliberating...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
