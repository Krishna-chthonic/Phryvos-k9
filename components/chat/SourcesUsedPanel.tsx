"use client";

import React, { useState } from "react";
import { FileText, ChevronDown, ChevronRight, ExternalLink, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VaultSourceCitation {
  id: string | number;
  filePath: string;
  chunkIndex: number;
  score: number;
  snippet: string;
}

interface SourcesUsedPanelProps {
  sources: VaultSourceCitation[];
  className?: string;
  onOpenVaultFile?: (filePath: string) => void;
}

export function SourcesUsedPanel({
  sources,
  className,
  onOpenVaultFile,
}: SourcesUsedPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className={cn("mt-2 mb-1 text-xs", className)}>
      {/* Trigger chip */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition-colors select-none text-[11px]"
      >
        <Bookmark className="w-3 h-3 text-cyan-400" />
        <span className="font-medium">
          Sources cited ({sources.length})
        </span>
        {isOpen ? (
          <ChevronDown className="w-3 h-3 text-neutral-500" />
        ) : (
          <ChevronRight className="w-3 h-3 text-neutral-500" />
        )}
      </button>

      {/* Expanded Sources List */}
      {isOpen && (
        <div className="mt-2 space-y-2 rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 max-w-xl">
          <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
            Retrieved Vault Citations
          </div>
          <div className="space-y-2">
            {sources.map((src, i) => {
              const matchPercent = Math.round(src.score * 100);
              return (
                <div
                  key={`${src.filePath}-${src.chunkIndex}-${i}`}
                  className="rounded-md border border-neutral-850 bg-neutral-900/50 p-2.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="font-mono text-neutral-200 truncate font-medium">
                        {src.filePath}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/40">
                        {matchPercent}% match
                      </span>
                      {onOpenVaultFile && (
                        <button
                          type="button"
                          onClick={() => onOpenVaultFile(src.filePath)}
                          className="p-1 text-neutral-400 hover:text-neutral-200 transition-colors"
                          title="Open file in Vault"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-neutral-400 font-mono leading-relaxed bg-black/40 p-2 rounded border border-neutral-800/50 line-clamp-3">
                    {src.snippet}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
