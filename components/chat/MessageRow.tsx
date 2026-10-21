"use client";

import React, { memo, useState } from "react";
import { Check, Copy, Pencil, Sparkles } from "lucide-react";
import type { ChatMessageDto } from "@/lib/chat-client";
import type { UnifiedPart } from "@/lib/ai/types";
import { AssistantBody } from "./AssistantBody";
import type { StepEvt } from "./types";

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

export const MessageRow = memo(function MessageRow({
  msg,
  streaming,
  elapsed,
  onEdit,
  liveSteps,
}: {
  msg: ChatMessageDto;
  streaming?: boolean;
  elapsed?: number;
  onEdit: (msg: ChatMessageDto) => void;
  liveSteps?: StepEvt[];
  toolName?: string;
}) {
  const [copied, setCopied] = useState(false);

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
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
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
          <div className="flex items-center gap-2 mb-2">
            <div className="h-5 w-5 rounded-[var(--radius-xs)] bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <Sparkles className="h-3 w-3 stroke-[1.5]" />
            </div>
            <span className="text-[11px] font-semibold text-[var(--fg-1)] uppercase tracking-wider">
              Assistant
            </span>
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
            {body}
          </div>
        ) : (
          <div className="text-[var(--text-md)] text-[var(--fg-0)]">
            <AssistantBody
              body={body}
              streaming={streaming}
              elapsed={elapsed}
              liveSteps={liveSteps}
              toolCalls={msg.toolCalls as any}
            />
          </div>
        )}

        {/* Action icons (copy & edit on hover) */}
        <div
          className={`mt-2 flex items-center gap-2 text-xs transition-opacity opacity-0 group-hover:opacity-100 ${
            user ? "justify-end text-[var(--fg-2)]" : "text-[var(--fg-2)]"
          }`}
        >
          {!streaming && body && (
            <button
              onClick={copyText}
              className="inline-flex items-center gap-1 hover:text-[var(--fg-0)] transition-colors cursor-pointer"
              title="Copy message"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400">Copied</span>
                </>
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          )}

          {user && !streaming && (
            <button
              onClick={() => onEdit(msg)}
              className="inline-flex items-center gap-1 hover:text-[var(--fg-0)] transition-colors cursor-pointer"
              title="Edit message"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
