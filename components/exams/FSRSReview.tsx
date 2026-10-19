"use client";

/**
 * FSRS Review — Spaced Repetition Review Interface
 * Shows due cards with rating buttons (Again, Hard, Good, Easy)
 * Integrates with exam subjects and topics
 *
 * Importers: app/(app)/exams/page.tsx (ExamsPage), components/exams/ExamsApp.tsx
 * Affected API: /api/fsrs (GET/POST), /api/fsrs/:id (GET/PATCH)
 * Data schemas: FSRSCard from lib/fsrs.ts - fields: id, subjectId, topicId, due, stability, difficulty, elapsedDays, scheduledDays, reps, lapses, state, lastReview, createdAt, updatedAt
 * Dates stored as integer UTC milliseconds
 * User instruction: "Continue Phase 3 implementation - FSRS Review UI"
 */
import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Brain, RotateCcw, Clock, AlertTriangle,
  CheckCircle, XCircle, Minus, Plus,
  Zap, Target, BookOpen, ArrowLeft
} from "lucide-react";

export interface FSRSCard {
  id: number;
  subjectId: number;
  topicId: number | null;
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: number; // 0=New, 1=Learning, 2=Review, 3=Relearning
  lastReview: number | null;
  createdAt: number;
  updatedAt: number;
}

interface PreviewData {
  rating: 1 | 2 | 3 | 4;
  nextDue: number;
  nextStability: number;
  nextDifficulty: number;
  nextState: number;
  nextIntervalDays: number;
}

interface CardWithPreview extends FSRSCard {
  previews?: PreviewData[];
  subjectName?: string;
  topicName?: string;
}

type Rating = 1 | 2 | 3 | 4;

const RATING_LABELS: Record<Rating, { label: string; short: string; color: string; icon: React.ReactNode }> = {
  1: { label: "Again", short: "Again", color: "bg-rose-500/20 border-rose-500/50 text-rose-400", icon: <XCircle className="h-4 w-4" /> },
  2: { label: "Hard", short: "Hard", color: "bg-amber-500/20 border-amber-500/50 text-amber-400", icon: <Minus className="h-4 w-4" /> },
  3: { label: "Good", short: "Good", color: "bg-emerald-500/20 border-emerald-500/50 text-emerald-400", icon: <CheckCircle className="h-4 w-4" /> },
  4: { label: "Easy", short: "Easy", color: "bg-cyan-500/20 border-cyan-500/50 text-cyan-400", icon: <Plus className="h-4 w-4" /> },
};

const STATE_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: "New", color: "text-cyan-400" },
  1: { label: "Learning", color: "text-amber-400" },
  2: { label: "Review", color: "text-emerald-400" },
  3: { label: "Relearning", color: "text-rose-400" },
};

function formatInterval(days: number): string {
  if (days < 1/1440) return "<1min";
  if (days < 1/60) return `${Math.round(days * 1440)}min`;
  if (days < 1) return `${Math.round(days * 60 * 24)}h`;
  if (days < 30) return `${days.toFixed(1)}d`;
  if (days < 365) return `${(days / 30).toFixed(1)}mo`;
  return `${(days / 365).toFixed(1)}yr`;
}

function formatDueDate(due: number): string {
  const now = Date.now();
  const diff = due - now;
  if (diff <= 0) return "Overdue";
  if (diff < 60000) return "Due now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}min`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h`;
  return `${Math.round(diff / 86400000)}d`;
}

export function FSRSReview({
  subjectId,
  subjectName,
  onBack,
  className
}: {
  subjectId: number;
  subjectName: string;
  onBack?: () => void;
  className?: string;
}) {
  const [cards, setCards] = useState<CardWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState<Rating | null>(null);
  const [stats, setStats] = useState({ due: 0, learning: 0, review: 0, relearning: 0, new: 0 });
  const [error, setError] = useState<string | null>(null);

  const fetchCards = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/fsrs?subjectId=${subjectId}&due=true`);
      if (!res.ok) throw new Error("Failed to fetch cards");
      const data = await res.json();
      setCards(data.cards || []);

      // Calculate stats
      const due = data.cards?.filter((c: FSRSCard) => c.due <= Date.now()).length || 0;
      const learning = data.cards?.filter((c: FSRSCard) => c.state === 1).length || 0;
      const review = data.cards?.filter((c: FSRSCard) => c.state === 2).length || 0;
      const relearning = data.cards?.filter((c: FSRSCard) => c.state === 3).length || 0;
      const newCards = data.cards?.filter((c: FSRSCard) => c.state === 0).length || 0;
      setStats({ due, learning, review, relearning, new: newCards });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const fetchCardDetails = useCallback(async (cardId: number) => {
    try {
      const res = await fetch(`/api/fsrs/${cardId}`);
      if (!res.ok) throw new Error("Failed to fetch card details");
      const data = await res.json();
      return data;
    } catch {
      return null;
    }
  }, []);

  const handleRate = useCallback(async (cardId: number, rating: Rating) => {
    try {
      const res = await fetch(`/api/fsrs/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) throw new Error("Failed to submit review");

      const data = await res.json();
      // Update local state
      setCards(prev => prev.map(c =>
        c.id === cardId ? { ...c, ...data.card } : c
      ));
      setReviewingId(null);
      setShowPreview(null);
      fetchCards(); // Refresh stats
    } catch (e) {
      setError(String(e));
    }
  }, [fetchCards]);

  const handleCardClick = useCallback(async (card: CardWithPreview) => {
    if (reviewingId === card.id) {
      setReviewingId(null);
      setShowPreview(null);
      return;
    }
    setReviewingId(card.id);
    setShowPreview(null);
    // Fetch previews if not already loaded
    if (!card.previews) {
      const data = await fetchCardDetails(card.id);
      if (data) {
        setCards(prev => prev.map(c =>
          c.id === card.id ? { ...c, previews: data.previews } : c
        ));
      }
    }
  }, [reviewingId, fetchCardDetails]);

  if (loading) {
    return (
      <div className={cn("flex flex-col h-full bg-neutral-950/80 rounded-lg border border-neutral-800", className)}>
        <div className="p-4 border-b border-neutral-800 bg-neutral-900/60 flex items-center gap-3">
          <Brain className="h-5 w-5 text-cyan-400 animate-spin" />
          <h2 className="text-lg font-semibold text-neutral-100 font-mono">FSRS Review</h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-neutral-400">
          Loading due cards...
        </div>
      </div>
    );
  }

  const dueCards = cards.filter(c => c.due <= Date.now());
  const upcomingCards = cards.filter(c => c.due > Date.now()).slice(0, 5);

  const currentCard = reviewingId ? cards.find(c => c.id === reviewingId) : dueCards[0];

  return (
    <div className={cn("flex flex-col h-full bg-neutral-950/80 rounded-lg border border-neutral-800 overflow-hidden", className)}>
      {/* Header */}
      <div className="p-4 border-b border-neutral-800 bg-neutral-900/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-cyan-400" />
              <h2 className="text-lg font-semibold text-neutral-100 font-mono">FSRS Review</h2>
            </div>
            <span className="px-2 py-0.5 text-xs rounded bg-neutral-800 text-neutral-400 font-mono">{subjectName}</span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={fetchCards} className="p-2 rounded hover:bg-neutral-800 text-neutral-400 hover:text-cyan-400 transition-colors" title="Refresh">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button onClick={() => setReviewingId(null)} className="p-2 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-100" title="Close review">
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/30 text-rose-400 font-mono">
            <AlertTriangle className="h-3 w-3 inline mr-1" /> Due: {stats.due}
          </span>
          <span className="px-2 py-1 rounded bg-amber-500/20 border border-amber-500/30 text-amber-400 font-mono">
            Learning: {stats.learning}
          </span>
          <span className="px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-mono">
            Review: {stats.review}
          </span>
          <span className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/30 text-rose-400 font-mono">
            Relearning: {stats.relearning}
          </span>
          <span className="px-2 py-1 rounded bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-mono">
            New: {stats.new}
          </span>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-rose-950/40 border-b border-rose-800/50 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Card list sidebar */}
        <div className="w-64 flex-shrink-0 border-r border-neutral-800 bg-neutral-900/50 overflow-y-auto p-3">
          <h3 className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
            Due Cards ({dueCards.length})
          </h3>
          {dueCards.length === 0 ? (
            <div className="px-2 py-8 text-center text-neutral-500 text-sm">
              <Brain className="h-8 w-8 mx-auto opacity-30 mb-2" />
              <p>No cards due for review</p>
              <p className="text-xs mt-1">Great job staying on top!</p>
            </div>
          ) : (
            <div className="space-y-1">
              {dueCards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => handleCardClick(card)}
                  className={cn(
                    "w-full p-2 rounded-lg text-left transition-all text-xs",
                    reviewingId === card.id
                      ? "bg-cyan-500/10 border border-cyan-500/30"
                      : "hover:bg-neutral-800 border border-transparent"
                  )}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-mono", STATE_LABELS[card.state]?.color)}>
                      {STATE_LABELS[card.state]?.label}
                    </span>
                    <span className="flex-1 text-neutral-400 truncate">{card.topicName || `Topic ${card.topicId}`}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-neutral-500">
                    <span>Stability: {card.stability.toFixed(1)}d</span>
                    <span className="font-mono">{formatDueDate(card.due)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {upcomingCards.length > 0 && (
            <div className="mt-4">
              <h3 className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
                Upcoming
              </h3>
              <div className="space-y-1">
                {upcomingCards.map((card) => (
                  <div key={card.id} className="px-2 py-1 text-xs text-neutral-500 border-l-2 border-neutral-700">
                    <div className="flex items-center justify-between">
                      <span className="truncate">{card.topicName || `Topic ${card.topicId}`}</span>
                      <span className="font-mono ml-2">{formatDueDate(card.due)}</span>
                    </div>
                    <div className="text-[10px]">Stability: {card.stability.toFixed(1)}d</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Review area */}
        <div className="flex-1 flex flex-col p-6">
          {currentCard ? (
            <div className="flex-1 flex flex-col items-center justify-center max-w-2xl w-full">
              {/* Card header */}
              <div className="mb-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className={cn("px-2 py-0.5 rounded text-xs font-mono", STATE_LABELS[currentCard.state]?.color)}>
                    {STATE_LABELS[currentCard.state]?.label}
                  </span>
                  {currentCard.topicName && (
                    <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 text-xs font-mono">
                      {currentCard.topicName}
                    </span>
                  )}
                </div>
                <div className="text-sm text-neutral-400">
                  Due: <span className="font-mono text-cyan-400">{formatDueDate(currentCard.due)}</span>
                  {currentCard.lastReview && (
                    <> · Last: <span className="font-mono">{new Date(currentCard.lastReview).toLocaleDateString()}</span></>
                  )}
                </div>
              </div>

              {/* Question/Content area */}
              <div className="mb-8 w-full max-w-xl">
                <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6">
                  <div className="text-center mb-4">
                    <span className="text-xs text-neutral-500 uppercase tracking-wider">Recall the concept</span>
                  </div>
                  <div className="min-h-[120px] flex items-center justify-center">
                    <p className="text-lg text-neutral-200 text-center font-mono leading-relaxed">
                      {currentCard.topicName ? `Review: ${currentCard.topicName}` : "Topic review"}
                    </p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-neutral-800 text-xs text-neutral-500 text-center">
                    <div className="flex items-center justify-center gap-4">
                      <span>Reps: <span className="font-mono text-cyan-400">{currentCard.reps}</span></span>
                      <span>Lapses: <span className="font-mono text-rose-400">{currentCard.lapses}</span></span>
                      <span>Stability: <span className="font-mono text-amber-400">{currentCard.stability.toFixed(1)}d</span></span>
                      <span>Difficulty: <span className="font-mono text-violet-400">{currentCard.difficulty.toFixed(1)}</span></span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rating buttons */}
              <div className="w-full max-w-xl">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {([1, 2, 3, 4] as Rating[]).map((rating) => {
                    const config = RATING_LABELS[rating];
                    const preview = currentCard.previews?.find(p => p.rating === rating);
                    const isPreview = showPreview === rating;

                    return (
                      <button
                        key={rating}
                        onClick={() => handleRate(currentCard.id, rating)}
                        onMouseEnter={() => preview && setShowPreview(rating)}
                        onMouseLeave={() => setShowPreview(null)}
                        className={cn(
                          "relative p-4 rounded-xl border transition-all flex flex-col items-center gap-2",
                          config.color,
                          isPreview && "ring-2 ring-offset-2 ring-offset-neutral-950 scale-105"
                        )}
                        disabled={reviewingId !== currentCard.id}
                      >
                        <div className="flex items-center gap-1">
                          {config.icon}
                          <span className="font-medium">{config.short}</span>
                        </div>
                        <span className="text-xs font-mono text-neutral-500">R{rating}</span>
                        {preview && (
                          <div className={cn(
                            "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-700 text-xs text-left min-w-[180px] z-10",
                            isPreview && "block"
                          )}>
                            <div className="text-cyan-400 font-medium mb-1">Next Interval Preview</div>
                            <div className="space-y-1 text-neutral-300">
                              <div>Interval: <span className="font-mono">{formatInterval(preview.nextIntervalDays)}</span></div>
                              <div>Due: <span className="font-mono">{new Date(preview.nextDue).toLocaleString()}</span></div>
                              <div>Stability: <span className="font-mono">{preview.nextStability.toFixed(1)}d</span></div>
                              <div>Difficulty: <span className="font-mono">{preview.nextDifficulty.toFixed(1)}</span></div>
                              <div>State: <span className="font-mono">{STATE_LABELS[preview.nextState]?.label}</span></div>
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Keyboard shortcuts hint */}
                <div className="text-center text-xs text-neutral-500">
                  <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded font-mono">1</kbd> Again &nbsp;
                  <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded font-mono">2</kbd> Hard &nbsp;
                  <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded font-mono">3</kbd> Good &nbsp;
                  <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded font-mono">4</kbd> Easy
                </div>
              </div>
            </div>
          ) : dueCards.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Brain className="h-16 w-16 text-neutral-700 mb-4" />
              <h3 className="text-xl font-semibold text-neutral-300 mb-2">All Caught Up!</h3>
              <p className="text-neutral-500 mb-6">No cards due for review right now.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => fetchCards()}
                  className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                >
                  <RotateCcw className="h-4 w-4 inline mr-1" /> Check Again
                </button>
                {onBack && (
                  <button
                    onClick={onBack}
                    className="px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4 inline mr-1" /> Back to Subjects
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}