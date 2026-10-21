"use client";

import * as React from "react";
import { Plus, ArrowUp, Square, Paperclip, X, Sparkles, ChevronDown } from "lucide-react";

export interface AttachedFile {
  name: string;
  path: string;
  size?: number;
}

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  attachedFiles?: AttachedFile[];
  onRemoveAttachment?: (path: string) => void;
  onAttachClick?: () => void;
  selectedModel?: string;
  onSelectModel?: (model: string) => void;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = "Ask anything, or type @ to attach a file",
  attachedFiles = [],
  onRemoveAttachment,
  onAttachClick,
  selectedModel = "Claude 3.5 Sonnet",
  onSelectModel,
}: ChatComposerProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea between 44px and 200px
  React.useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(Math.max(el.scrollHeight, 40), 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && value.trim()) {
        onSubmit();
      }
    }
  };

  const hasText = value.trim().length > 0;

  return (
    <div className="w-full flex flex-col space-y-2">
      {/* Attached Context Pills Row */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-2">
          {attachedFiles.map((file) => (
            <span
              key={file.path}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-full)] bg-[var(--bg-2)] border border-[var(--border-subtle)] text-[var(--text-xs)] text-[var(--fg-1)] select-none"
            >
              <Paperclip className="h-3 w-3 text-[var(--fg-2)] stroke-[1.5]" />
              <span className="truncate max-w-[140px]">{file.name}</span>
              {onRemoveAttachment && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(file.path)}
                  className="p-0.5 rounded-full hover:bg-[var(--bg-3)] hover:text-[var(--fg-0)] transition-colors"
                >
                  <X className="h-2.5 w-2.5 stroke-[1.5]" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Pill Container */}
      <div className="relative flex items-end gap-2 p-2 bg-[var(--bg-1)] border border-[var(--border)] rounded-[var(--radius-xl)] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)] transition-colors duration-120">
        {/* Attach Button */}
        {onAttachClick && (
          <button
            type="button"
            onClick={onAttachClick}
            disabled={disabled}
            className="p-2 rounded-[var(--radius-full)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] transition-colors shrink-0 outline-none"
            title="Attach file (@)"
          >
            <Plus className="h-4 w-4 stroke-[1.5]" />
          </button>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 bg-transparent text-[var(--fg-0)] placeholder:text-[var(--fg-2)] text-[var(--text-md)] resize-none outline-none py-1.5 px-1 leading-[22px] min-h-[36px] max-h-[200px]"
        />

        {/* Send / Stop Button */}
        <div className="shrink-0 mb-0.5">
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="h-[28px] w-[28px] rounded-[var(--radius-full)] bg-[var(--danger)] text-white flex items-center justify-center transition-colors shadow-none hover:bg-[var(--danger)]/90"
              title="Stop generating"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={disabled || !hasText}
              className={`h-[28px] w-[28px] rounded-[var(--radius-full)] flex items-center justify-center transition-colors shadow-none ${
                hasText
                  ? "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] cursor-pointer"
                  : "bg-[var(--bg-2)] text-[var(--fg-3)] cursor-not-allowed"
              }`}
              title="Send message (Enter)"
            >
              <ArrowUp className="h-3.5 w-3.5 stroke-[2]" />
            </button>
          )}
        </div>
      </div>

      {/* Meta Footer Row: Model Selector & Shortcuts */}
      <div className="flex items-center justify-between px-2 text-[var(--text-xs)] text-[var(--fg-2)] select-none">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] hover:bg-[var(--bg-2)] hover:text-[var(--fg-1)] transition-colors"
          >
            <Sparkles className="h-3 w-3 text-[var(--accent)] stroke-[1.5]" />
            <span>{selectedModel}</span>
            <ChevronDown className="h-3 w-3 stroke-[1.5]" />
          </button>
        </div>
        <span className="text-[11px] text-[var(--fg-3)]">
          Return to send &middot; Shift+Return for new line
        </span>
      </div>
    </div>
  );
}
