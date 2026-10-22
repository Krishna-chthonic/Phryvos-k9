"use client";

import React, { memo, useState, useRef, useEffect } from "react";
import { Brain, Check, Copy, Pencil, Sparkles, GitBranch, ThumbsUp, ThumbsDown } from "lucide-react";
import type { ChatMessageDto } from "@/lib/chat-client";
import type { UnifiedPart } from "@/lib/ai/types";
import { AssistantBody } from "./AssistantBody";
import type { StepEvt } from "./types";
import type { VaultSourceCitation } from "./SourcesUsedPanel";
import { TurnRouteInspector } from "./TurnRouteInspector";

export function textOf(content: string | UnifiedPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

export function imagesOf(
  content: string | UnifiedPart[],
): Array<{ b64: string; mime: string }> {
  if (typeof content === "string") return [];
  return content
    .filter((p) => p.type === "image" && p.dataBase64)
    .map((p) => ({ b64: p.dataBase64!, mime: p.mediaType ?? "image/png" }));
}

export interface MessageRowProps {
  msg: ChatMessageDto;
  streaming?: boolean;
  elapsed?: number;
  onEdit: (msg: ChatMessageDto) => void;
  onFork?: (msgId: string) => void;
  onFeedback?: (msgId: string, feedback: "helpful" | "unhelpful" | null) => void;
  liveSteps?: StepEvt[];
  toolName?: string;
  sources?: VaultSourceCitation[];
  onSaveToMemory?: (text: string) => void;
  onOpenVaultFile?: (filePath: string) => void;
  searchQuery?: string;
  activeMatchIndex?: number;
}

export function areMessageRowPropsEqual(
  prev: MessageRowProps,
  next: MessageRowProps,
): boolean {
  if (prev.streaming !== next.streaming) return false;
  if (next.streaming) return false;
  if (prev.msg.id !== next.msg.id) return false;
  if (prev.msg.seq !== next.msg.seq) return false;
  if (prev.msg.content !== next.msg.content) return false;
  if (prev.msg.editedAt !== next.msg.editedAt) return false;
  if (prev.msg.feedback !== next.msg.feedback) return false;
  if (prev.searchQuery !== next.searchQuery) return false;
  if (prev.activeMatchIndex !== next.activeMatchIndex) return false;
  if ((prev.sources?.length ?? 0) !== (next.sources?.length ?? 0)) return false;
  if (JSON.stringify(prev.msg.telemetry) !== JSON.stringify(next.msg.telemetry)) return false;
  return true;
}

function renderHighlightedText(text: string, query?: string) {
  if (!query || !query.trim()) return text;
  const q = query.trim();
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let start = 0;

  while (start < text.length) {
    const idx = lowerText.indexOf(lowerQ, start);
    if (idx === -1) {
      parts.push(text.slice(start));
      break;
    }
    if (idx > start) {
      parts.push(text.slice(start, idx));
    }
    parts.push(
      <mark
        key={idx}
        className="bg-amber-300/80 dark:bg-amber-500/40 text-inherit rounded-sm px-0.5"
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    start = idx + q.length;
  }
  return parts;
}

export const MessageRow = memo(function MessageRow({
  msg,
  streaming,
  elapsed,
  onEdit,
  onFork,
  onFeedback,
  liveSteps,
  toolName,
  sources,
  onSaveToMemory,
  onOpenVaultFile,
  searchQuery,
  activeMatchIndex,
}: MessageRowProps) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // CHAT-54: Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  // Hide raw tool execution returns from chat feed
  if (msg.role === "tool") {
    return null;
  }

  const user = msg.role === "user";
  const body = textOf(msg.content);
  const imgs = imagesOf(msg.content);

  // If this is an empty intermediate assistant message with no text, hide it
  if (!user && !body && !streaming && (!liveSteps || liveSteps.length === 0)) {
    return null;
  }

  const copyText = () => {
    navigator.clipboard.writeText(body);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id={`message-${msg.id}`}
      className={`group flex w-full ${
        user ? "justify-end" : "justify-start"
      } px-2 sm:px-4 py-2 select-text`}
    >
      <div
        className={`relative ${
          user
            ? "max-w-[560px] bg-[var(--bg-2)] text-[var(--fg-0)] border border-[var(--border-subtle)] rounded-[14px_14px_4px_14px] px-3.5 py-2.5 shadow-none"
            : "w-full max-w-[680px] text-[var(--fg-0)] py-2 px-1 leading-[22px]"
        }`}
      >
        {/* Assistant Sparkle Avatar on Top */}
        {!user && (
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-[var(--radius-xs)] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
                <Sparkles className="h-3 w-3 stroke-[1.5]" />
              </div>
              <span className="text-[11px] font-semibold text-[var(--fg-1)] uppercase tracking-wider">
                Phryvos AI
              </span>
            </div>
            {/* CHAT-55: Telemetry pill for completed assistant messages */}
            {!streaming && msg.telemetry && (
              <TurnRouteInspector telemetry={msg.telemetry} />
            )}
          </div>
        )}

        {/* Images */}
        {imgs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {imgs.map((im, i) => (
              <img
                key={i}
                src={`data:${im.mime};base64,${im.b64}`}
                alt="attachment"
                className="h-32 rounded-[var(--radius-sm)] object-cover border border-[var(--border-subtle)]"
              />
            ))}
          </div>
        )}

        {/* Content */}
        {user ? (
          <div className="whitespace-pre-wrap text-[var(--text-md)] leading-relaxed text-[var(--fg-0)]">
            {renderHighlightedText(body, searchQuery)}
          </div>
        ) : (
          <div className="text-[var(--text-md)] text-[var(--fg-0)]">
            <AssistantBody
              body={body}
              streaming={streaming}
              elapsed={elapsed}
              liveSteps={liveSteps}
              toolCalls={msg.toolCalls as any}
              sources={sources}
              onOpenVaultFile={onOpenVaultFile}
            />
          </div>
        )}

        {/* Action icons & controls */}
        <div
          className={`mt-2 flex items-center gap-1 text-xs transition-opacity opacity-80 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 ${
            user ? "justify-end text-[var(--fg-2)]" : "text-[var(--fg-2)]"
          }`}
        >
          {/* Feature D: Turn-level feedback reaction buttons */}
          {!user && !streaming && body && onFeedback && (
            <div className="flex items-center gap-0.5 mr-1">
              <button
                type="button"
                onClick={() =>
                  onFeedback(msg.id, msg.feedback === "helpful" ? null : "helpful")
                }
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer ${
                  msg.feedback === "helpful"
                    ? "text-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/20"
                    : "text-[var(--fg-2)] hover:text-emerald-500"
                }`}
                title="Helpful response"
                aria-label="Mark response as helpful"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onFeedback(msg.id, msg.feedback === "unhelpful" ? null : "unhelpful")
                }
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer ${
                  msg.feedback === "unhelpful"
                    ? "text-rose-500 bg-rose-500/10 dark:bg-rose-500/20"
                    : "text-[var(--fg-2)] hover:text-rose-500"
                }`}
                title="Unhelpful response"
                aria-label="Mark response as unhelpful"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Feature A: Branch conversation button */}
          {onFork && !streaming && (
            <button
              type="button"
              onClick={() => onFork(msg.id)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-[var(--fg-2)] hover:text-indigo-500 transition-colors cursor-pointer"
              title="Branch conversation from here"
              aria-label="Branch conversation from here"
            >
              <GitBranch className="h-3.5 w-3.5" />
            </button>
          )}

          {!streaming && body && (
            <button
              type="button"
              onClick={copyText}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-[var(--fg-2)] hover:text-[var(--fg-0)] transition-colors cursor-pointer"
              title="Copy message"
              aria-label="Copy message to clipboard"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          {onSaveToMemory && !streaming && body && (
            <button
              type="button"
              onClick={() => onSaveToMemory(body)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-[var(--fg-2)] hover:text-purple-400 transition-colors cursor-pointer"
              title="Save to permanent memory"
              aria-label="Save to permanent memory"
            >
              <Brain className="h-3.5 w-3.5" />
            </button>
          )}

          {user && !streaming && (
            <button
              type="button"
              onClick={() => onEdit(msg)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-zinc-200/60 dark:hover:bg-zinc-800 text-[var(--fg-2)] hover:text-[var(--fg-0)] transition-colors cursor-pointer"
              title="Edit message"
              aria-label="Edit this message"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}, areMessageRowPropsEqual);
