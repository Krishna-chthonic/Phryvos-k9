"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Brain,
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Filter,
  Sparkles,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface MemoryItem {
  id: number;
  point: string;
  category: string;
  sourceSessionId?: string | null;
  source?: string | null;
  createdAt: number;
  updatedAt: number;
}

interface MemoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSessionId?: string;
  className?: string;
  initialNewMemoryPoint?: string;
}

export function MemoryDrawer({
  isOpen,
  onClose,
  currentSessionId,
  className,
  initialNewMemoryPoint,
}: MemoryDrawerProps) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // New memory state
  const [isAdding, setIsAdding] = useState(false);
  const [newPoint, setNewPoint] = useState(initialNewMemoryPoint || "");
  const [newCategory, setNewCategory] = useState("fact");
  const [associateWithSession, setAssociateWithSession] = useState(true);

  // Editing state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPoint, setEditPoint] = useState("");

  const fetchMemories = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/memories");
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      }
    } catch {
      // Fetch error handled gracefully
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMemories();
      if (initialNewMemoryPoint) {
        setIsAdding(true);
        setNewPoint(initialNewMemoryPoint);
      }
    }
  }, [isOpen, initialNewMemoryPoint]);

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPoint.trim()) return;

    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          point: newPoint.trim(),
          category: newCategory,
          sourceSessionId: associateWithSession && currentSessionId ? currentSessionId : undefined,
        }),
      });

      if (res.ok) {
        setNewPoint("");
        setIsAdding(false);
        fetchMemories();
      }
    } catch {}
  };

  const handleUpdateMemory = async (id: number) => {
    if (!editPoint.trim()) return;
    try {
      const res = await fetch(`/api/memories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ point: editPoint.trim() }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchMemories();
      }
    } catch {}
  };

  const handleDeleteMemory = async (id: number) => {
    try {
      const res = await fetch(`/api/memories/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchMemories();
      }
    } catch {}
  };

  const categories = useMemo(() => {
    const set = new Set<string>(["all"]);
    for (const m of memories) {
      if (m.category) set.add(m.category);
    }
    return Array.from(set);
  }, [memories]);

  const filteredMemories = useMemo(() => {
    return memories.filter((m) => {
      const matchesSearch =
        !searchQuery ||
        m.point.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat =
        selectedCategory === "all" || m.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [memories, searchQuery, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "fixed inset-y-0 right-0 w-[500px] max-w-[90vw] bg-neutral-950/95 border-l border-neutral-800 backdrop-blur-md shadow-2xl z-50 flex flex-col transition-transform duration-300",
        isOpen ? "translate-x-0" : "translate-x-full",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/60">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-neutral-200">Permanent Memory</h3>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
            {memories.length} facts
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAdding((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Fact
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
            aria-label="Close Memory Drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="p-3 border-b border-neutral-850 space-y-2 bg-neutral-900/30">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search permanent memories..."
            className="w-full bg-neutral-900 border border-neutral-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-purple-500/50"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wider transition-colors",
                selectedCategory === cat
                  ? "bg-purple-600 text-white"
                  : "bg-neutral-800/80 text-neutral-400 hover:bg-neutral-800",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Add New Memory Card */}
      {isAdding && (
        <form
          onSubmit={handleCreateMemory}
          className="m-3 p-3 rounded-lg border border-purple-500/30 bg-purple-950/20 space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-300">
              New Permanent Fact
            </span>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-neutral-500 hover:text-neutral-300 text-xs"
            >
              Cancel
            </button>
          </div>

          <textarea
            value={newPoint}
            onChange={(e) => setNewPoint(e.target.value)}
            placeholder="What should the AI permanently remember?"
            rows={2}
            className="w-full bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-purple-500/50"
          />

          <div className="flex items-center justify-between gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-300 focus:outline-none"
            >
              <option value="fact">Fact</option>
              <option value="preference">Preference</option>
              <option value="project">Project Context</option>
              <option value="math_rule">Math / Rule</option>
            </select>

            {currentSessionId && (
              <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={associateWithSession}
                  onChange={(e) => setAssociateWithSession(e.target.checked)}
                  className="rounded border-neutral-800 bg-neutral-900 text-purple-600"
                />
                Tag this session
              </label>
            )}

            <Button type="submit" size="sm" variant="primary" className="text-xs">
              Save Fact
            </Button>
          </div>
        </form>
      )}

      {/* Memories List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {loading && memories.length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-500">
            Loading memories...
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-500">
            No memories found. Click &quot;Add Fact&quot; to store one.
          </div>
        ) : (
          filteredMemories.map((mem) => {
            const isEditing = editingId === mem.id;
            const isFromCurrentSession =
              currentSessionId && mem.sourceSessionId === currentSessionId;

            return (
              <div
                key={mem.id}
                className="rounded-lg border border-neutral-850 bg-neutral-900/40 p-3 hover:border-neutral-800 transition-all text-xs"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editPoint}
                      onChange={(e) => setEditPoint(e.target.value)}
                      rows={2}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-neutral-200 focus:outline-none"
                    />
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleUpdateMemory(mem.id)}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-neutral-200 leading-relaxed font-normal">
                        {mem.point}
                      </p>

                      <div className="flex items-center gap-1 shrink-0 opacity-80 hover:opacity-100">
                        <button
                          onClick={() => {
                            setEditingId(mem.id);
                            setEditPoint(mem.point);
                          }}
                          className="p-1 text-neutral-400 hover:text-neutral-200"
                          title="Edit fact"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteMemory(mem.id)}
                          className="p-1 text-neutral-400 hover:text-rose-400"
                          title="Delete fact (creates tombstone)"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[10px] text-neutral-500 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase">
                          {mem.category}
                        </span>

                        {isFromCurrentSession ? (
                          <span className="px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                            Current Session
                          </span>
                        ) : mem.sourceSessionId ? (
                          <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                            Session linked
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400">
                            Global
                          </span>
                        )}
                      </div>

                      <span>{new Date(mem.createdAt).toLocaleDateString()}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
