"use client";

import * as React from "react";
import { Sparkles, X, Send, Bot, User, Minimize2, Maximize2, RotateCcw } from "lucide-react";
import { authApi } from "@/lib/api/client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

interface FloatingAssistantProps {
  open: boolean;
  onClose: () => void;
}

export function FloatingAssistant({ open, onClose }: FloatingAssistantProps) {
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I am your quick vault assistant. You can ask me to summarize notes, search your vault, or draft quick ideas without switching pages.",
      createdAt: new Date(),
    },
  ]);
  const [input, setInput] = React.useState("");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [isMinimized, setIsMinimized] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, isMinimized]);

  if (!open) return null;

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: Message = {
      id: `u_${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    try {
      // Call quick assistant endpoint
      const res = await fetch("/api/ai/free/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "You are Phryvos K9 Quick Assistant. Provide concise, direct, helpful answers to assist the user while they work in their local vault.",
            },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: trimmed },
          ],
        }),
      });

      if (!res.ok) {
        throw new Error(`AI service responded with ${res.status}`);
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "No response received.";

      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: reply,
          createdAt: new Date(),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: `Note: Offline or provider standby. ${err.message || "Please check AI settings."}`,
          createdAt: new Date(),
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }

  function handleClear() {
    setMessages([
      {
        id: `welcome_${Date.now()}`,
        role: "assistant",
        content: "Chat cleared. What can I help you with?",
        createdAt: new Date(),
      },
    ]);
  }

  return (
    <div
      className={`fixed z-50 right-5 bottom-5 transition-all duration-200 select-text ${
        isMinimized
          ? "w-[280px] h-[48px]"
          : "w-[92vw] sm:w-[380px] h-[520px] max-h-[85vh]"
      } flex flex-col rounded-[var(--radius-lg)] bg-[var(--bg-1)] border border-[var(--border)] shadow-[var(--shadow-dialog)] overflow-hidden`}
    >
      {/* Header */}
      <div className="h-[48px] px-3.5 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-1)] shrink-0 select-none">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-[var(--radius-xs)] bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)]">
            <Sparkles className="h-3.5 w-3.5 stroke-[1.5]" />
          </div>
          <div>
            <span className="text-[var(--text-sm)] font-medium text-[var(--fg-0)]">
              Quick Assistant
            </span>
            <span className="ml-2 text-[10px] text-[var(--accent)] bg-[var(--accent-soft)] px-1.5 py-0.2 rounded-full border border-[var(--accent-border)]">
              Floating
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleClear}
            className="p-1 rounded-[var(--radius-xs)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] transition-colors"
            title="Clear Chat"
          >
            <RotateCcw className="h-3.5 w-3.5 stroke-[1.5]" />
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded-[var(--radius-xs)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] transition-colors"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? (
              <Maximize2 className="h-3.5 w-3.5 stroke-[1.5]" />
            ) : (
              <Minimize2 className="h-3.5 w-3.5 stroke-[1.5]" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[var(--radius-xs)] text-[var(--fg-2)] hover:text-[var(--fg-0)] hover:bg-[var(--bg-2)] transition-colors"
            title="Close (⌘J)"
          >
            <X className="h-3.5 w-3.5 stroke-[1.5]" />
          </button>
        </div>
      </div>

      {/* Body when not minimized */}
      {!isMinimized && (
        <>
          {/* Messages Stream */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 min-h-0 bg-[var(--bg-0)]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2.5 ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {m.role === "assistant" && (
                  <div className="h-5 w-5 rounded-full bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)] shrink-0 mt-0.5">
                    <Sparkles className="h-3 w-3 stroke-[1.5]" />
                  </div>
                )}
                <div
                  className={`px-3 py-2 text-[var(--text-sm)] leading-[var(--leading-sm)] rounded-[var(--radius-md)] max-w-[85%] ${
                    m.role === "user"
                      ? "bg-[var(--bg-2)] border border-[var(--border)] text-[var(--fg-0)] rounded-br-[2px]"
                      : "bg-[var(--bg-1)] border border-[var(--border-subtle)] text-[var(--fg-0)] rounded-bl-[2px]"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}
            {isStreaming && (
              <div className="flex gap-2.5 justify-start">
                <div className="h-5 w-5 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-[var(--accent)] shrink-0 mt-0.5 animate-pulse">
                  <Sparkles className="h-3 w-3 stroke-[1.5]" />
                </div>
                <div className="px-3 py-2 rounded-[var(--radius-md)] bg-[var(--bg-1)] border border-[var(--border-subtle)] text-[var(--text-xs)] text-[var(--fg-2)] flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-ping" />
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Composer */}
          <form
            onSubmit={handleSend}
            className="p-2.5 bg-[var(--bg-1)] border-t border-[var(--border-subtle)] shrink-0"
          >
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask quick question or command..."
                disabled={isStreaming}
                className="w-full h-[38px] pl-3 pr-10 rounded-[var(--radius-sm)] bg-[var(--bg-0)] border border-[var(--border)] text-[var(--text-sm)] text-[var(--fg-0)] placeholder:text-[var(--fg-2)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_var(--accent-soft)] transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="absolute right-1.5 h-[28px] w-[28px] rounded-[var(--radius-xs)] bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--accent-hover)] transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between mt-1 px-1 text-[10px] text-[var(--fg-2)]">
              <span>Press Enter to send</span>
              <span>⌘J to close</span>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
