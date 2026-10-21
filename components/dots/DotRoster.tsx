"use client";

import React from "react";
import Link from "next/link";
import { Plus, Sparkles, X, Menu, ArrowLeft, MessageSquare, Trash2 } from "lucide-react";
import { DotMascot } from "./DotMascot";
import type { DotDto } from "@/lib/dots-service";

interface DotRosterProps {
  dots: DotDto[];
  selectedDotId: string | null;
  onSelectDot: (id: string) => void;
  onOpenNewDotDialog: () => void;
  onDeleteDot?: (id: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  desktopOpen?: boolean;
}

export function DotRoster({
  dots,
  selectedDotId,
  onSelectDot,
  onOpenNewDotDialog,
  onDeleteDot,
  mobileOpen,
  onCloseMobile,
  desktopOpen = true,
}: DotRosterProps) {
  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Roster Aside */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-zinc-200 bg-white transition-all duration-300 ease-in-out md:static md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950 ${
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        } ${desktopOpen ? "md:w-64" : "md:hidden"}`}
      >
        {/* Roster Header */}
        <div className="flex h-14 items-center justify-between border-b border-zinc-200/80 px-3.5 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-xs dark:bg-zinc-800 dark:text-zinc-100">
              <Sparkles className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                AI Coworkers
              </div>
              <div className="text-[10px] text-zinc-400 font-medium">
                {dots.length} Specialist{dots.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onOpenNewDotDialog}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
              title="Spawn New Dot"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New</span>
            </button>
            <button
              onClick={onCloseMobile}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200 md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Dots List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {dots.map((dot) => {
            const isSelected = dot.id === selectedDotId;
            return (
              <button
                key={dot.id}
                type="button"
                onClick={() => {
                  onSelectDot(dot.id);
                  onCloseMobile();
                }}
                className={`group flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-all cursor-pointer ${
                  isSelected
                    ? "bg-zinc-100 shadow-2xs border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                }`}
              >
                {/* Avatar with status ring */}
                <div className="relative shrink-0">
                  <DotMascot
                    character={dot.character}
                    size="small"
                    state={dot.status}
                    className="w-9 h-9"
                  />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-zinc-950 ${
                      dot.status === "working"
                        ? "bg-amber-500 animate-pulse"
                        : dot.status === "complete"
                        ? "bg-emerald-500"
                        : dot.status === "paused"
                        ? "bg-zinc-400"
                        : "bg-emerald-500"
                    }`}
                  />
                </div>

                {/* Identity Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`truncate text-xs font-semibold ${
                        isSelected
                          ? "text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {dot.name}
                    </span>
                    <span className="text-[10px] font-medium text-zinc-400 capitalize">
                      {dot.status}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-zinc-400 mt-0.5">{dot.role}</p>
                </div>

                {/* Delete Coworker Button */}
                {onDeleteDot && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteDot(dot.id);
                    }}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition shrink-0 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
                    title={`Delete ${dot.name}`}
                    aria-label={`Delete ${dot.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </button>
            );
          })}
        </div>

        {/* Roster Footer / Back to App Controls */}
        <div className="border-t border-zinc-200/80 p-2.5 space-y-1 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/50">
          <Link
            href="/chat"
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
          >
            <MessageSquare className="h-4 w-4 text-zinc-500" />
            <div className="flex-1 min-w-0 truncate">Back to Chat</div>
            <ArrowLeft className="h-3.5 w-3.5 rotate-180 text-zinc-400" />
          </Link>

          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              window.dispatchEvent(new CustomEvent("phryvos:open-menu"));
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition md:hidden"
          >
            <Menu className="h-4 w-4 text-zinc-500" />
            <div className="flex-1 min-w-0 truncate text-left">Main App Navigation</div>
          </button>
        </div>
      </aside>
    </>
  );
}
