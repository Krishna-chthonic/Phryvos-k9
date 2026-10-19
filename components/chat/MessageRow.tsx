"use client";

import React, { memo, useState } from "react";
import { Check, Copy, Pencil } from "lucide-react";
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
      } px-2 sm:px-4 py-2`}
    >
      <div
        className={`relative ${
          user
            ? "max-w-[85%] md:max-w-[75%] lg:max-w-[70%] bg-zinc-100 text-zinc-900 border border-zinc-200/80 rounded-2xl rounded-tr-xs px-4 py-3 dark:bg-zinc-800 dark:border-zinc-700/80 dark:text-zinc-100 shadow-2xs"
            : "w-full text-zinc-900 dark:text-zinc-100 py-2.5 px-1 sm:px-2 leading-relaxed"
        }`}
      >
        {/* Images */}
        {imgs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {imgs.map((im, i) => (
              <img
                key={i}
                src={`data:${im.mime};base64,${im.b64}`}
                alt="attachment"
                className="h-32 rounded-lg object-cover ring-1 ring-zinc-200"
              />
            ))}
          </div>
        )}

        {/* Content */}
        {user ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {body}
          </div>
        ) : (
          <AssistantBody
            body={body}
            streaming={streaming}
            elapsed={elapsed}
            liveSteps={liveSteps}
            toolCalls={msg.toolCalls as any}
          />
        )}

        {/* Action icons (copy & edit) */}
        <div
          className={`mt-1.5 flex items-center gap-2 text-xs transition-opacity ${
            user ? "justify-end text-zinc-400" : "text-zinc-400"
          }`}
        >
          {!streaming && body && (
            <button
              onClick={copyText}
              className="flex items-center gap-1 hover:text-zinc-600 cursor-pointer"
              title="Copy message"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-500" />
                  <span className="text-[10px] text-emerald-600">Copied</span>
                </>
              ) : (
                <Copy className="h-3 w-3 opacity-60 hover:opacity-100" />
              )}
            </button>
          )}

          {user && !streaming && (
            <button
              onClick={() => onEdit(msg)}
              className="flex items-center gap-1 hover:text-zinc-200 cursor-pointer"
              title="Edit message"
            >
              <Pencil className="h-3 w-3 opacity-60 hover:opacity-100" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
