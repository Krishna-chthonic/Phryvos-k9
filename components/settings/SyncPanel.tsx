"use client";

import React, { useState, useEffect } from "react";
import {
  Smartphone,
  Laptop,
  Wifi,
  KeyRound,
  RefreshCw,
  Check,
  Shield,
  ArrowRightLeft,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function SyncPanel() {
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [remainingSecs, setRemainingSecs] = useState<number>(0);
  const [pairingInput, setPairingInput] = useState<string>("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (remainingSecs <= 0) return;
    const t = setInterval(() => {
      setRemainingSecs((prev) => {
        if (prev <= 1) {
          setActiveCode(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [remainingSecs]);

  const handleGenerateCode = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/sync/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_code", deviceName: "Host Workstation" }),
      });
      const data = await res.json();
      if (res.ok && data.code) {
        setActiveCode(data.code);
        setRemainingSecs(data.expiresInSeconds || 300);
        setStatusMsg("One-time pairing code generated! Enter this code on your mobile device.");
      } else {
        setStatusMsg(data.error || "Failed to generate pairing code.");
      }
    } catch {
      setStatusMsg("Network error generating code.");
    } finally {
      setLoading(false);
    }
  };

  const handlePairDevice = async () => {
    if (!pairingInput.trim()) return;
    setLoading(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/sync/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pair_device",
          code: pairingInput.trim(),
          peerDeviceName: "Companion Device",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg(`✅ Paired successfully! Peer token generated for local delta sync.`);
        setPairingInput("");
      } else {
        setStatusMsg(`❌ ${data.error || "Invalid code"}`);
      }
    } catch {
      setStatusMsg("Failed to connect to peer.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeltaSyncNow = async () => {
    setSyncing(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/sync/delta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceTimestamp: Date.now() - 24 * 60 * 60 * 1000 }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg(`✅ Local Delta Sync Complete: ${data.deltaCount} files synchronized.`);
      } else {
        setStatusMsg("Sync error.");
      }
    } catch {
      setStatusMsg("Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
            <Wifi className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Local Wi-Fi P2P Encrypted Sync
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Pair your phone, tablet, or secondary PC directly over local Wi-Fi with zero third-party cloud relay.
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          onClick={handleDeltaSyncNow}
          disabled={syncing}
          className="text-xs h-8 px-3"
        >
          <ArrowRightLeft className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Delta Now"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Device Host Mode: Generate Pairing Code */}
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Laptop className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Host Workstation (This Device)
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Generate a short-lived 6-digit PIN to allow another device on your Wi-Fi to sync with your encrypted vault.
          </p>

          {activeCode ? (
            <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-center">
              <span className="text-xs text-purple-600 dark:text-purple-400 font-medium block">
                Pairing Code (Expires in {remainingSecs}s)
              </span>
              <div className="text-3xl font-mono font-extrabold tracking-widest text-purple-700 dark:text-purple-300 mt-1">
                {activeCode}
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              onClick={handleGenerateCode}
              disabled={loading}
              className="w-full text-xs h-8 bg-purple-600 hover:bg-purple-700 text-white"
            >
              <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Generate 6-Digit Pairing Code
            </Button>
          )}
        </div>

        {/* Client Mode: Enter Pairing Code */}
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              Pair with Remote Device
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Enter the 6-digit code displayed on your other device to connect and establish peer pairing.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              maxLength={6}
              value={pairingInput}
              onChange={(e) => setPairingInput(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 583921"
              className="flex-1 font-mono text-center tracking-widest text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-zinc-900 dark:text-zinc-100 outline-hidden"
            />
            <Button
              variant="secondary"
              onClick={handlePairDevice}
              disabled={loading || pairingInput.length < 6}
              className="text-xs h-8 px-4"
            >
              Connect
            </Button>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="mt-3 p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-200">
          {statusMsg}
        </div>
      )}
    </div>
  );
}
