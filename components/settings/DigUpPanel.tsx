"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Database,
  RefreshCw,
  Loader2,
  Code2,
  FileCode,
  Sparkles,
  Check,
  Copy,
  Layers,
  Terminal,
  Zap,
} from "lucide-react";

interface DigUpResultItem {
  filePath: string;
  matchType: "hybrid" | "semantic" | "keyword";
  score: number;
  snippet: string;
  language: string;
  tokenCount?: number;
  chunkIndex?: number;
}

interface DigUpStats {
  totalFiles: number;
  totalChunks: number;
  totalTokens: number;
  lastIndexedAt?: number;
}

const COMMON_EXTS = [".ts", ".tsx", ".py", ".sql", ".sh", ".md", ".json"];

export function DigUpPanel() {
  const [stats, setStats] = useState<DigUpStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [indexDir, setIndexDir] = useState("/");

  const [query, setQuery] = useState("");
  const [selectedExts, setSelectedExts] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DigUpResultItem[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/search/digup?stats=true");
      if (res.ok) {
        const json = await res.json();
        if (json.stats) setStats(json.stats);
      }
    } catch (err) {
      console.error("Failed to load DigUp stats:", err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleIndexVault = async () => {
    setIndexing(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/search/digup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "index", dirPath: indexDir.trim() || "/" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to index vault");
      }
      if (json.stats) setStats(json.stats);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIndexing(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/search/digup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "search",
          query: query.trim(),
          limit: 15,
          fileTypes: selectedExts.length > 0 ? selectedExts : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Search failed");
      }
      setResults(json.results || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const toggleExt = (ext: string) => {
    setSelectedExts((prev) =>
      prev.includes(ext) ? prev.filter((e) => e !== ext) : [...prev, ext],
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPath(text);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  return (
    <section className="bg-surface rounded-2xl border border-border p-5 space-y-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text flex items-center gap-2">
              DigUp Hybrid Code & Doc Engine
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                RRF K=60
              </span>
            </h2>
            <p className="text-xs text-text-muted">
              Deep conceptual search combining SQLite FTS5 exact hits and vector embeddings
            </p>
          </div>
        </div>

        <button
          onClick={loadStats}
          disabled={loadingStats}
          className="p-2 rounded-lg bg-surface-2 border border-border hover:border-purple-500/30 text-text-muted hover:text-text transition-colors disabled:opacity-50"
          title="Refresh index statistics"
        >
          <RefreshCw className={`w-4 h-4 ${loadingStats ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Index Metrics Bar */}
      <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-surface-2/60 border border-border text-center">
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider text-text-muted">Files Indexed</span>
          <p className="text-base font-bold text-text font-mono mt-0.5">
            {stats ? stats.totalFiles.toLocaleString() : "—"}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider text-text-muted">Code Chunks</span>
          <p className="text-base font-bold text-purple-400 font-mono mt-0.5">
            {stats ? stats.totalChunks.toLocaleString() : "—"}
          </p>
        </div>
        <div>
          <span className="text-[10px] uppercase font-mono tracking-wider text-text-muted">Tokens Cached</span>
          <p className="text-base font-bold text-emerald-400 font-mono mt-0.5">
            {stats ? stats.totalTokens.toLocaleString() : "—"}
          </p>
        </div>
      </div>

      {/* Indexer Control */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-surface-2/40 border border-border">
        <Database className="w-4 h-4 text-text-muted shrink-0" />
        <span className="text-xs text-text-muted font-mono shrink-0">Dir:</span>
        <input
          type="text"
          value={indexDir}
          onChange={(e) => setIndexDir(e.target.value)}
          placeholder="/"
          className="flex-1 min-w-[120px] bg-surface border border-border rounded-lg px-2.5 py-1 text-xs text-text font-mono focus:outline-none focus:border-purple-500/50"
        />
        <button
          onClick={handleIndexVault}
          disabled={indexing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors disabled:opacity-50 shadow-sm"
        >
          {indexing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Indexing...</span>
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              <span>Re-Index Vault</span>
            </>
          )}
        </button>
      </div>

      {/* Search Input Bar */}
      <form onSubmit={handleSearch} className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code by logic or intent (e.g. 'token rate limiter', 'telegram bot command handler')..."
            className="w-full bg-surface border border-border rounded-xl pl-9 pr-24 py-2 text-xs text-text placeholder:text-text-muted/60 focus:outline-none focus:border-purple-500/50 transition-colors"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-purple-600 hover:bg-purple-500 disabled:bg-surface-2 disabled:text-text-muted text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
          >
            {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            <span>Find</span>
          </button>
        </div>

        {/* Extension Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-text-muted font-mono mr-1">Filter:</span>
          {COMMON_EXTS.map((ext) => {
            const active = selectedExts.includes(ext);
            return (
              <button
                type="button"
                key={ext}
                onClick={() => toggleExt(ext)}
                className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition-colors ${
                  active
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/40 font-semibold"
                    : "bg-surface-2 text-text-muted border-border hover:border-purple-500/20"
                }`}
              >
                {ext}
              </button>
            );
          })}
          {selectedExts.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedExts([])}
              className="text-[10px] text-text-muted hover:text-text underline ml-1"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Error Message */}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Results View */}
      {results !== null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-text-muted font-mono">
            <span>Results ({results.length})</span>
            {results.length > 0 && <span>Ranked by Reciprocal Rank Fusion</span>}
          </div>

          {results.length === 0 ? (
            <div className="p-6 text-center text-xs text-text-muted bg-surface-2/30 rounded-xl border border-dashed border-border">
              No code or doc matches found for this query.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {results.map((hit, idx) => (
                <div
                  key={`${hit.filePath}-${idx}`}
                  className="p-3 rounded-xl bg-surface-2/60 border border-border hover:border-purple-500/30 transition-all space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span className="text-xs font-mono font-medium text-text truncate">
                        {hit.filePath}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                          hit.matchType === "hybrid"
                            ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                            : hit.matchType === "semantic"
                            ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                            : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        }`}
                      >
                        {hit.matchType}
                      </span>
                      <span className="text-[10px] font-mono text-text-muted">
                        score: {hit.score}
                      </span>
                      <button
                        onClick={() => copyToClipboard(hit.filePath)}
                        className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text transition-colors"
                        title="Copy file path"
                      >
                        {copiedPath === hit.filePath ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Code Snippet Box */}
                  <pre className="text-[11px] font-mono bg-background/90 text-text/80 p-2.5 rounded-lg overflow-x-auto border border-border/80 whitespace-pre-wrap leading-relaxed">
                    {hit.snippet}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
