/**
 * Memory management panel for phryvos-k9 Settings page.
 *
 * Importers/callers: app/(app)/settings/page.tsx
 * Affected API: GET /api/memories, POST /api/memories, DELETE /api/memories/[id]
 * Data schemas if any: memories table (id, point, category, created_at, updated_at)
 * User instruction verbatim: "3. ek memmory system bhi hona chahiye ai ke liye jisme vo points bana ke chijo ko permanentlt yaad rakhe jinko users khud se kahe ki ye chij yaad rakhna ya permanently save kar lo"
 */
"use client";

import { useState, useEffect } from "react";
import { Brain, Plus, Trash2, Search, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MemoryItem {
  id: number;
  point: string;
  category: string;
  createdAt: number;
  updatedAt: number;
}

export function MemoryPanel() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [newPoint, setNewPoint] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/memories");
      if (res.ok) {
        const json = (await res.json()) as { memories: MemoryItem[] };
        setMemories(json.memories ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newPoint.trim() || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ point: newPoint.trim() }),
      });
      if (res.ok) {
        setNewPoint("");
        await load();
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/memories/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = memories.filter((m) =>
    m.point.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Permanent AI Memory
            </h2>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Facts, personal preferences, and instructions the AI permanently remembers across all conversations.
          </p>
        </div>
        <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {memories.length} {memories.length === 1 ? "fact" : "facts"} remembered
        </div>
      </div>

      {/* Manual Add Form */}
      <form onSubmit={handleAdd} className="mb-4 flex gap-2">
        <Input
          placeholder="Add something to remember (e.g. 'I am preparing for GATE 2027')"
          value={newPoint}
          onChange={(e) => setNewPoint(e.target.value)}
          className="flex-1 text-sm bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100"
        />
        <Button type="submit" disabled={!newPoint.trim() || adding} className="gap-1.5 shrink-0">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span>Remember</span>
        </Button>
      </form>

      {/* Search Input */}
      {memories.length > 3 && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search remembered facts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800"
          />
        </div>
      )}

      {/* Memory Items List */}
      <div className="space-y-2">
        {loading ? (
          <div className="py-6 text-center text-xs text-zinc-400">Loading memories…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-center dark:border-zinc-800">
            <Sparkles className="mx-auto mb-2 h-6 w-6 text-zinc-300 dark:text-zinc-700" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {search
                ? "No memories matched your search."
                : "No permanent memories stored yet. You can add one above or tell the AI in chat: \"ye yaad rakhna\" or \"remember that...\""}
            </p>
          </div>
        ) : (
          filtered.map((m) => (
            <div
              key={m.id}
              className="group flex items-start justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/60 dark:hover:bg-zinc-950"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                <div className="min-w-0">
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                    {m.point}
                  </p>
                  <span className="text-[10px] text-zinc-400">
                    Added {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(m.id)}
                disabled={deletingId === m.id}
                className="shrink-0 p-1 text-zinc-400 hover:text-red-600 transition disabled:opacity-50"
                title="Forget this memory"
              >
                {deletingId === m.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
