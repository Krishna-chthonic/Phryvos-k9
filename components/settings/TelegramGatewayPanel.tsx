"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Send,
  ShieldCheck,
  Power,
  Key,
  Users,
  CheckCircle2,
  Trash2,
  AlertCircle,
  HelpCircle,
  Radio,
  ExternalLink,
  Loader2,
  Zap,
} from "lucide-react";

interface TelegramUser {
  id: number;
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  status: "pending" | "approved" | "rejected";
  pairingCode?: string | null;
  pairedAt?: number | null;
  createdAt: number;
}

interface GatewayData {
  config: {
    botToken: string;
    hasToken: boolean;
    enabled: boolean;
    dmPolicy: "pairing" | "allowlist" | "open";
    updatedAt: number;
  };
  users: TelegramUser[];
  isRunning: boolean;
  lastPollTime: number;
}

export function TelegramGatewayPanel() {
  const [data, setData] = useState<GatewayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [botTokenInput, setBotTokenInput] = useState("");
  const [dmPolicy, setDmPolicy] = useState<"pairing" | "allowlist" | "open">("pairing");
  const [saving, setSaving] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/gateway/telegram");
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setDmPolicy(json.config.dmPolicy || "pairing");
      }
    } catch (e) {
      console.error("Failed to load Telegram gateway status", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/gateway/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_config",
          botToken: botTokenInput || undefined,
          dmPolicy,
        }),
      });
      const resData = await res.json();
      if (res.ok) {
        setFeedback({ type: "success", message: "Gateway configuration saved!" });
        setBotTokenInput("");
        await loadData();
      } else {
        setFeedback({ type: "error", message: resData.error?.message || "Failed to save configuration." });
      }
    } catch (e) {
      setFeedback({ type: "error", message: e instanceof Error ? e.message : "Error saving config" });
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePower = async () => {
    if (!data) return;
    const nextAction = data.isRunning ? "stop" : "start";
    setActionInProgress("power");
    setFeedback(null);
    try {
      const res = await fetch("/api/gateway/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextAction }),
      });
      const resData = await res.json();
      if (res.ok) {
        setFeedback({
          type: "success",
          message: data.isRunning ? "Gateway stopped." : "Gateway started! Listening via long-polling.",
        });
        await loadData();
      } else {
        setFeedback({ type: "error", message: resData.error?.message || "Action failed." });
      }
    } catch (e) {
      setFeedback({ type: "error", message: e instanceof Error ? e.message : "Failed to toggle power" });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApproveUser = async (codeOrId: string) => {
    setActionInProgress(`approve-${codeOrId}`);
    try {
      const res = await fetch("/api/gateway/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_user", codeOrId }),
      });
      if (res.ok) {
        await loadData();
      }
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRevokeUser = async (telegramId: string) => {
    setActionInProgress(`revoke-${telegramId}`);
    try {
      const res = await fetch("/api/gateway/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_user", telegramId }),
      });
      if (res.ok) {
        await loadData();
      }
    } finally {
      setActionInProgress(null);
    }
  };

  const handleTestPing = async (telegramId: string) => {
    setActionInProgress(`ping-${telegramId}`);
    try {
      const res = await fetch("/api/gateway/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_ping", telegramId }),
      });
      const resData = await res.json();
      if (resData.success) {
        setFeedback({ type: "success", message: `Test ping sent to ${telegramId}!` });
      } else {
        setFeedback({ type: "error", message: "Failed to send ping. Check bot token." });
      }
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  const pendingUsers = data?.users.filter((u) => u.status === "pending") || [];
  const approvedUsers = data?.users.filter((u) => u.status === "approved") || [];

  return (
    <div className="rounded-3xl border border-zinc-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-500">
            <Send className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Telegram Remote Command Hub
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 font-bold uppercase tracking-wider">
                OpenClaw Engine
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Control your vault, personal chats, and coworker Dots from Telegram with zero public IP or port-forwarding.
            </p>
          </div>
        </div>

        {/* Live Power Status */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 text-xs font-semibold">
            <span
              className={`h-2 w-2 rounded-full ${
                data?.isRunning ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
              }`}
            />
            <span className="text-zinc-700 dark:text-zinc-300">
              {data?.isRunning ? "Long-Polling Active" : "Stopped"}
            </span>
          </div>

          <button
            onClick={handleTogglePower}
            disabled={actionInProgress === "power" || !data?.config.hasToken}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50 ${
              data?.isRunning
                ? "bg-zinc-200 text-zinc-800 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                : "bg-emerald-600 text-white hover:bg-emerald-500"
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            <span>{data?.isRunning ? "Stop Gateway" : "Start Gateway"}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 p-3 rounded-2xl text-xs ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50"
              : "bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-300 border border-red-200/50 dark:border-red-800/50"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Bot Configuration Form */}
      <form onSubmit={handleSaveConfig} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Bot Token */}
          <div>
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
              Telegram Bot Token (@BotFather)
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder={data?.config.hasToken ? "•••••••••••••••••••••••• (Token configured)" : "123456789:ABC-DEF1234ghIkl..."}
                value={botTokenInput}
                onChange={(e) => setBotTokenInput(e.target.value)}
                className="w-full h-9 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-sky-500 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100 font-mono"
              />
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">
              Create a bot with <span className="font-semibold text-zinc-500">@BotFather</span> on Telegram and paste the token here.
            </p>
          </div>

          {/* DM Policy */}
          <div>
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
              DM Access & Security Policy
            </label>
            <select
              value={dmPolicy}
              onChange={(e) => setDmPolicy(e.target.value as any)}
              className="w-full h-9 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 text-xs text-zinc-900 focus:border-sky-500 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100"
            >
              <option value="pairing">Pairing Code (Recommended — Zero Trust)</option>
              <option value="allowlist">Allowlist Only (Pre-registered IDs)</option>
              <option value="open">Open (Anyone who knows bot)</option>
            </select>
            <p className="text-[10px] text-zinc-400 mt-1">
              {dmPolicy === "pairing"
                ? "New devices generate a 6-digit PIN on Telegram that you approve below."
                : dmPolicy === "allowlist"
                ? "Only pre-approved IDs can interact with your vault."
                : "Open to anyone (not recommended for private vaults)."}
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 active:scale-95 dark:bg-sky-600 dark:hover:bg-sky-500 transition cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
            <span>Save Configuration</span>
          </button>
        </div>
      </form>

      {/* Pending Access Requests (Pairing Queue) */}
      {pendingUsers.length > 0 && (
        <div className="p-4 rounded-2xl border border-amber-200/80 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Pending Device Pairing Requests ({pendingUsers.length})
              </h4>
            </div>
            <span className="text-[10px] text-amber-700 dark:text-amber-300">
              Awaiting confirmation
            </span>
          </div>

          <div className="space-y-2">
            {pendingUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-zinc-900 border border-amber-200/60 dark:border-amber-900/40 text-xs"
              >
                <div>
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <span>{u.firstName || u.username || "Telegram User"}</span>
                    {u.username && <span className="text-zinc-400">@{u.username}</span>}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                    ID: {u.telegramId} • PIN: <span className="font-bold text-amber-600 dark:text-amber-400">{u.pairingCode}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleApproveUser(u.pairingCode || u.telegramId)}
                  disabled={actionInProgress === `approve-${u.pairingCode}`}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Approve & Link</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved Whitelist Users */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-zinc-500" />
            <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              Linked Telegram Devices ({approvedUsers.length})
            </h4>
          </div>
        </div>

        {approvedUsers.length === 0 ? (
          <div className="p-4 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-400">
            No linked Telegram users yet. Start the gateway and send `/start` to your bot on Telegram to begin pairing.
          </div>
        ) : (
          <div className="space-y-2">
            {approvedUsers.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 text-xs"
              >
                <div>
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <span>{u.firstName || u.username || "Telegram User"}</span>
                    {u.username && <span className="text-zinc-400">@{u.username}</span>}
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold">
                      Linked
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                    Telegram ID: {u.telegramId}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleTestPing(u.telegramId)}
                    disabled={actionInProgress === `ping-${u.telegramId}`}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-xs font-medium transition cursor-pointer"
                    title="Send test ping message"
                  >
                    <Zap className="h-3 w-3 text-amber-500" />
                    <span>Ping</span>
                  </button>

                  <button
                    onClick={() => handleRevokeUser(u.telegramId)}
                    disabled={actionInProgress === `revoke-${u.telegramId}`}
                    className="h-7 w-7 flex items-center justify-center rounded-lg border border-zinc-200 bg-white hover:bg-red-50 text-zinc-400 hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-red-950/40 transition cursor-pointer"
                    title="Revoke access"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Command Cheat-Sheet */}
      <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800/60 text-xs space-y-2">
        <h5 className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5 text-sky-500" />
          <span>Telegram Commands Cheat-Sheet:</span>
        </h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
          <div>• <span className="text-zinc-900 dark:text-zinc-100 font-bold">/chat &lt;msg&gt;</span> — Personal AI Chat</div>
          <div>• <span className="text-zinc-900 dark:text-zinc-100 font-bold">/dot atlas &lt;msg&gt;</span> — Command Dot</div>
          <div>• <span className="text-zinc-900 dark:text-zinc-100 font-bold">/tasks</span> — View Kanban tasks</div>
          <div>• <span className="text-zinc-900 dark:text-zinc-100 font-bold">/worktrees</span> — Check Git worktrees</div>
          <div>• <span className="text-zinc-900 dark:text-zinc-100 font-bold">/status</span> — System RAM & Vault</div>
          <div>• <span className="text-zinc-900 dark:text-zinc-100 font-bold">/memorize &lt;fact&gt;</span> — Save memory</div>
        </div>
      </div>
    </div>
  );
}
