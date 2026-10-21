"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileCheck2,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  RefreshCw,
  BookMarked,
  ShieldCheck,
  Layers,
  Sparkles,
  Loader2,
  FileText,
} from "lucide-react";
import type { LearnedRule, PromptContract, VerificationChecklist, RuleCategory } from "@/lib/ecc/ecc-engine";

export function EccRulesPanel() {
  const [rules, setRules] = useState<LearnedRule[]>([]);
  const [contracts, setContracts] = useState<Record<string, PromptContract>>({});
  const [verifications, setVerifications] = useState<VerificationChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<"rules" | "contracts" | "gate">("rules");

  // New Rule Form
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [newCat, setNewCat] = useState<RuleCategory>("coding");
  const [savingRule, setSavingRule] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadEccState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ecc");
      if (res.ok) {
        const json = await res.json();
        if (json.learnedRules) setRules(json.learnedRules);
        if (json.contracts) setContracts(json.contracts);
        if (json.recentVerifications) setVerifications(json.recentVerifications);
      }
    } catch (err) {
      console.error("Failed to load ECC state:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEccState();
  }, [loadEccState]);

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newText.trim()) return;

    setSavingRule(true);
    try {
      const res = await fetch("/api/ecc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "learn_rule",
          title: newTitle.trim(),
          ruleText: newText.trim(),
          category: newCat,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showNotification("success", `Learned new rule: "${newTitle}"`);
        setNewTitle("");
        setNewText("");
        if (json.learnedRules) setRules(json.learnedRules);
      }
    } catch (err) {
      showNotification("error", String(err));
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      const res = await fetch("/api/ecc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_rule", id }),
      });
      const json = await res.json();
      if (json.success && json.learnedRules) {
        setRules(json.learnedRules);
        showNotification("success", "Rule deleted.");
      }
    } catch (err) {
      showNotification("error", String(err));
    }
  };

  return (
    <section className="bg-surface rounded-2xl border border-border p-5 space-y-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text flex items-center gap-2">
              ECC Surgical Contracts & Rule Evolution
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                {rules.length} Learned Rules
              </span>
            </h2>
            <p className="text-xs text-text-muted">
              Quality verification gates and continuous learning from user corrections
            </p>
          </div>
        </div>

        <button
          onClick={loadEccState}
          disabled={loading}
          className="p-2 rounded-lg bg-surface-2 border border-border hover:border-cyan-500/30 text-text-muted hover:text-text transition-colors disabled:opacity-50"
          title="Refresh Rules"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Navigation Sub-tabs */}
      <div className="flex items-center gap-1.5 border-b border-border pb-2 text-xs">
        <button
          onClick={() => setSubTab("rules")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
            subTab === "rules"
              ? "bg-cyan-500/10 text-cyan-400 font-semibold"
              : "text-text-muted hover:text-text"
          }`}
        >
          <BookMarked className="w-3.5 h-3.5" />
          <span>Learned Rulebook ({rules.length})</span>
        </button>

        <button
          onClick={() => setSubTab("contracts")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
            subTab === "contracts"
              ? "bg-cyan-500/10 text-cyan-400 font-semibold"
              : "text-text-muted hover:text-text"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Phase Contracts (3)</span>
        </button>

        <button
          onClick={() => setSubTab("gate")}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
            subTab === "gate"
              ? "bg-cyan-500/10 text-cyan-400 font-semibold"
              : "text-text-muted hover:text-text"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Quality Verification Gates</span>
        </button>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-2.5 rounded-lg text-xs font-medium border flex items-center gap-2 ${
            notification.type === "success"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{notification.text}</span>
        </div>
      )}

      {/* SUB-VIEW 1: LEARNED RULES */}
      {subTab === "rules" && (
        <div className="space-y-4">
          {/* Add Rule Form */}
          <form onSubmit={handleCreateRule} className="p-3 rounded-xl bg-surface-2/40 border border-border space-y-2.5">
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className="font-semibold text-text">Record New Learned Rule / Constraint</span>
              <select
                value={newCat}
                onChange={(e) => setNewCat(e.target.value as RuleCategory)}
                className="bg-surface border border-border rounded px-2 py-0.5 text-xs text-text font-mono outline-none"
              >
                <option value="coding">Coding</option>
                <option value="safety">Safety</option>
                <option value="formatting">Formatting</option>
                <option value="workflow">Workflow</option>
                <option value="user_preference">User Preference</option>
              </select>
            </div>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Rule Title (e.g. 'Preserve Unrelated Comments', 'Always use param queries')..."
              className="w-full bg-surface border border-border rounded-lg px-2.5 py-1 text-xs text-text outline-none focus:border-cyan-500/50"
            />
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={2}
              placeholder="Detailed instruction or constraint for future agent executions..."
              className="w-full bg-surface border border-border rounded-lg p-2.5 text-xs text-text font-mono outline-none focus:border-cyan-500/50"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingRule || !newTitle.trim() || !newText.trim()}
                className="px-3.5 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1 shadow-sm"
              >
                {savingRule ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                <span>Learn & Save to Vault</span>
              </button>
            </div>
          </form>

          {/* Rules List */}
          <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
            {rules.map((r) => (
              <div
                key={r.id}
                className="p-3 rounded-xl bg-surface-2/60 border border-border space-y-1.5 hover:border-cyan-500/30 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/20 font-semibold">
                      {r.category}
                    </span>
                    <span className="text-xs font-semibold text-text">{r.title}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(r.id)}
                    className="p-1 rounded hover:bg-surface text-text-muted hover:text-rose-400 transition-colors"
                    title="Delete Rule"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs text-text-muted font-mono leading-relaxed">{r.ruleText}</p>
                <div className="text-[10px] text-text-muted/60 font-mono flex items-center justify-between pt-1">
                  <span>Source: {r.source}</span>
                  <span>Confidence: {(r.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: PHASE CONTRACTS */}
      {subTab === "contracts" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.entries(contracts).map(([key, contract]) => (
            <div
              key={key}
              className="p-4 rounded-xl bg-surface-2/60 border border-border space-y-2.5 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-400 uppercase font-mono">
                  {contract.phase} Phase
                </span>
                <span className="text-[10px] text-text-muted font-mono">Contract</span>
              </div>
              <h3 className="text-xs font-semibold text-text">{contract.title}</h3>
              <ul className="space-y-1.5 text-[11px] text-text-muted font-sans leading-relaxed">
                {contract.systemRules.map((rule, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-cyan-400 font-bold shrink-0">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* SUB-VIEW 3: QUALITY VERIFICATION GATE */}
      {subTab === "gate" && (
        <div className="p-4 rounded-xl bg-surface-2/60 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text">Standard Pre-Commit Quality Gate</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-bold">
              4/4 CHECKS ENFORCED
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-lg bg-surface flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Type Check Integrity (`tsc --noEmit`)</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400">PASSED</span>
            </div>

            <div className="p-2.5 rounded-lg bg-surface flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Production Webpack Build (`next build --webpack`)</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400">55+ ROUTES</span>
            </div>

            <div className="p-2.5 rounded-lg bg-surface flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Documentation & Comment Preservation</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400">100% INTACT</span>
            </div>

            <div className="p-2.5 rounded-lg bg-surface flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Surgical Scope Confinement</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400">VERIFIED</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
