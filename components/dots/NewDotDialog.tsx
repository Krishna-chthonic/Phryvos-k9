"use client";

import React, { useState } from "react";
import { X, Sparkles, Terminal, Folder, Globe, Search, Play, Check } from "lucide-react";
import { DotMascot, type DotCharacter } from "./DotMascot";
import type { DotDto } from "@/lib/dots-service";

interface NewDotDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (dot: DotDto) => void;
}

const CHARACTERS: { key: DotCharacter; label: string; accent: string }[] = [
  { key: "blue", label: "Engineer", accent: "ring-sky-500 bg-sky-50 dark:bg-sky-950/40" },
  { key: "mint", label: "Researcher", accent: "ring-emerald-500 bg-emerald-50 dark:bg-emerald-950/40" },
  { key: "orange", label: "Ops & Scribe", accent: "ring-amber-500 bg-amber-50 dark:bg-amber-950/40" },
  { key: "purple", label: "Coach & Tutor", accent: "ring-purple-500 bg-purple-50 dark:bg-purple-950/40" },
];

const AVAILABLE_TOOLS = [
  { id: "terminal", label: "Terminal / Bash", icon: Terminal, desc: "Execute commands, run build & scripts" },
  { id: "vault", label: "Vault Storage", icon: Folder, desc: "Read and write encrypted notes and files" },
  { id: "web_search", label: "Web Search", icon: Search, desc: "Search authoritative online sources" },
  { id: "web_fetch", label: "Web Fetch", icon: Globe, desc: "Fetch and read full page URLs" },
  { id: "python_runner", label: "Python Sandbox", icon: Play, desc: "Execute computational math and data scripts" },
];

export function NewDotDialog({ open, onClose, onCreated }: NewDotDialogProps) {
  const [character, setCharacter] = useState<DotCharacter>("blue");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tools, setTools] = useState<string[]>(["terminal", "vault", "web_search", "web_fetch"]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const toggleTool = (toolId: string) => {
    setTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim() || !systemPrompt.trim()) {
      setErr("Name, role, and system instructions are required.");
      return;
    }

    setSubmitting(true);
    setErr(null);

    try {
      const res = await fetch("/api/dots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          character,
          role: role.trim(),
          description: description.trim(),
          systemPrompt: systemPrompt.trim(),
          tools,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "Failed to create coworker");
      }

      const { dot } = await res.json();
      onCreated(dot);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error creating Dot");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-xs dark:bg-zinc-800 dark:text-zinc-100">
              <Sparkles className="h-4.5 w-4.5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                New Specialist Dot
              </h2>
              <p className="text-xs text-zinc-500">
                Create an always-on AI coworker for your vault
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[80vh] overflow-y-auto p-6 space-y-5">
          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {err}
            </div>
          )}

          {/* Character Identity Selector */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-2">
              Select Character Identity
            </label>
            <div className="grid grid-cols-4 gap-2.5">
              {CHARACTERS.map((c) => {
                const isSelected = character === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCharacter(c.key)}
                    className={`flex flex-col items-center p-2.5 rounded-2xl border transition-all ${
                      isSelected
                        ? `border-zinc-900 ring-2 ${c.accent} dark:border-zinc-100`
                        : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    <DotMascot character={c.key} size="medium" />
                    <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 mt-1 capitalize">
                      {c.key}
                    </span>
                    <span className="text-[9px] text-zinc-400 truncate max-w-full">
                      {c.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name & Role Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Neo, Cypher, Orion"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 text-xs text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-100 dark:focus:border-zinc-600 dark:focus:bg-zinc-800 transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Specialist Role
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Senior Backend Engineer"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full h-9 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 text-xs text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-100 dark:focus:border-zinc-600 dark:focus:bg-zinc-800 transition"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
              Short Description (Optional)
            </label>
            <input
              type="text"
              placeholder="What does this coworker do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-9 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 text-xs text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-100 dark:focus:border-zinc-600 dark:focus:bg-zinc-800 transition"
            />
          </div>

          {/* System Persona Prompt */}
          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
              System Persona & Working Instructions
            </label>
            <textarea
              required
              rows={3}
              placeholder="Define instructions, personality, guidelines, and work style for this Dot..."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 text-xs text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-100 dark:focus:border-zinc-600 dark:focus:bg-zinc-800 transition resize-none leading-relaxed"
            />
          </div>

          {/* Tool Permissions */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-2">
              Virtual Computer & Tool Capabilities
            </label>
            <div className="space-y-1.5">
              {AVAILABLE_TOOLS.map((tool) => {
                const Icon = tool.icon;
                const isChecked = tools.includes(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => toggleTool(tool.id)}
                    className={`flex w-full items-center justify-between p-2.5 rounded-xl border text-left transition ${
                      isChecked
                        ? "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/80"
                        : "border-zinc-200 hover:bg-zinc-50/60 dark:border-zinc-800 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {tool.label}
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {tool.desc}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        isChecked
                          ? "bg-zinc-900 border-zinc-900 text-white dark:bg-emerald-600 dark:border-emerald-600 dark:text-white"
                          : "border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {isChecked && <Check className="h-3 w-3" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Submit */}
          <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-zinc-900 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 active:scale-95 disabled:opacity-50 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-500 transition cursor-pointer"
            >
              {submitting ? "Spawning Dot…" : "Spawn Dot"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
