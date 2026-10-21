"use client";

import React, { useState } from "react";
import { Plus, BookOpen, Trash2, Sparkles, Check, FileText, ArrowRight, GitBranch } from "lucide-react";
import type { DotDto, DotSpaceDto } from "@/lib/dots-service";
import { OrcaFleetPanel } from "./OrcaFleetPanel";

interface DotSpacesPanelProps {
  dot: DotDto;
  spaces: DotSpaceDto[];
  onRefreshSpaces: () => void;
  onAskDotToReview: (docTitle: string, docContent: string) => void;
}

export function DotSpacesPanel({
  dot,
  spaces,
  onRefreshSpaces,
  onAskDotToReview,
}: DotSpacesPanelProps) {
  const [viewMode, setViewMode] = useState<"spaces" | "orca">("spaces");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(
    spaces.length > 0 ? spaces[0].id : null
  );
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const activeSpace = spaces.find((s) => s.id === selectedSpaceId);

  // Sync editor fields when active space changes
  React.useEffect(() => {
    if (activeSpace) {
      setTitle(activeSpace.title);
      setContent(activeSpace.content);
    } else if (spaces.length > 0) {
      setSelectedSpaceId(spaces[0].id);
      setTitle(spaces[0].title);
      setContent(spaces[0].content);
    } else {
      setTitle("");
      setContent("");
    }
  }, [selectedSpaceId, activeSpace, spaces]);

  const handleCreateNewPage = async () => {
    try {
      const res = await fetch(`/api/dots/${dot.id}/spaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled Page",
          content: "# Untitled Page\n\nStart drafting your collaborative document with " + dot.name + "...",
        }),
      });
      const data = await res.json();
      onRefreshSpaces();
      if (data.space?.id) {
        setSelectedSpaceId(data.space.id);
      }
    } catch (e) {
      console.error("Failed to create page", e);
    }
  };

  const handleSavePage = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/dots/${dot.id}/spaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedSpaceId || undefined,
          title: title.trim(),
          content,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onRefreshSpaces();
    } catch (e) {
      console.error("Failed to save space", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePage = async (idToDelete: string) => {
    if (!confirm("Delete this document page?")) return;
    try {
      await fetch(`/api/dots/${dot.id}/spaces?spaceId=${idToDelete}`, {
        method: "DELETE",
      });
      onRefreshSpaces();
      if (selectedSpaceId === idToDelete) {
        setSelectedSpaceId(null);
      }
    } catch (e) {
      console.error("Failed to delete space", e);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-white dark:bg-zinc-950">
      {/* Sub-navigation bar: Spaces vs Orca Fleet */}
      <div className="shrink-0 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 bg-zinc-50/80 dark:bg-zinc-900/40">
        <div className="flex items-center gap-1.5 bg-zinc-200/60 dark:bg-zinc-800/80 p-0.5 rounded-lg text-xs">
          <button
            onClick={() => setViewMode("spaces")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition cursor-pointer ${
              viewMode === "spaces"
                ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <BookOpen className="h-3.5 w-3.5 text-emerald-500" />
            <span>Docs & Spaces ({spaces.length})</span>
          </button>

          <button
            onClick={() => setViewMode("orca")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-medium transition cursor-pointer ${
              viewMode === "orca"
                ? "bg-white text-zinc-900 shadow-2xs font-semibold dark:bg-zinc-700 dark:text-zinc-100"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <GitBranch className="h-3.5 w-3.5 text-indigo-500" />
            <span>Orca Worktree Fleet</span>
          </button>
        </div>
      </div>

      {viewMode === "orca" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <OrcaFleetPanel />
        </div>
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left Sub-sidebar: Document Pages */}
          <div className="w-56 sm:w-64 shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              Spaces & Pages
            </span>
          </div>
          <button
            onClick={handleCreateNewPage}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition"
            title="New Document Page"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
          {spaces.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-400">
              No pages yet. Create one to collaborate with {dot.name}!
            </div>
          ) : (
            spaces.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelectedSpaceId(s.id)}
                className={`group flex items-center justify-between rounded-xl px-3 py-2 text-xs transition cursor-pointer ${
                  s.id === selectedSpaceId
                    ? "bg-zinc-200 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{s.title || "Untitled"}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeletePage(s.id);
                  }}
                  className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:text-red-500"
                  title="Delete page"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Canvas: Document Editor & Dot Review */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-950">
        {selectedSpaceId ? (
          <>
            {/* Action Bar */}
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-4 py-2.5 bg-zinc-50/50 dark:bg-zinc-900/30">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Page Title…"
                className="text-sm font-bold text-zinc-900 dark:text-zinc-100 bg-transparent outline-none flex-1 truncate"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onAskDotToReview(title, content)}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-50/80 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300 transition"
                  title="Ask Dot to review and suggest changes"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Ask {dot.name} to Review</span>
                </button>

                <button
                  onClick={handleSavePage}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-800 active:scale-95 disabled:opacity-50 dark:bg-zinc-800 dark:border dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer"
                >
                  {saved ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : null}
                  <span>{saving ? "Saving…" : saved ? "Saved" : "Save"}</span>
                </button>
              </div>
            </div>

            {/* Document Content Textarea */}
            <div className="flex-1 p-6 overflow-y-auto">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your document content in markdown..."
                className="w-full h-full min-h-[400px] resize-none bg-transparent text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 outline-none font-mono"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-400">
            <BookOpen className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-3" />
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Select or create a page
            </h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-relaxed">
              Spaces let you collaborate on documents, research reports, and specs alongside your Dot.
            </p>
            <button
              onClick={handleCreateNewPage}
              className="mt-4 flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white dark:bg-zinc-800 dark:border dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-700 transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create New Page</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )}
</div>
  );
}
