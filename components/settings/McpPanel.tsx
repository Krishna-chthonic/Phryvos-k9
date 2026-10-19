"use client";

import React, { useState } from "react";
import {
  Boxes,
  Server,
  Plus,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  Cpu,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface McpServerItem {
  id: string;
  name: string;
  transport: "stdio" | "sse" | "in-memory";
  toolsCount: number;
  enabled: boolean;
}

export function McpPanel() {
  const [servers, setServers] = useState<McpServerItem[]>([
    {
      id: "mcp-symbolic-cas",
      name: "Symbolic CAS Math & Limits Kernel",
      transport: "in-memory",
      toolsCount: 3,
      enabled: true,
    },
    {
      id: "mcp-physics-sim",
      name: "JEE Rapier3D Kinematics Simulator",
      transport: "stdio",
      toolsCount: 2,
      enabled: true,
    },
  ]);
  const [newServerName, setNewServerName] = useState("");
  const [newTransport, setNewTransport] = useState<"stdio" | "sse">("stdio");
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = () => {
    if (!newServerName.trim()) return;
    const newServer: McpServerItem = {
      id: `mcp-${Date.now()}`,
      name: newServerName.trim(),
      transport: newTransport,
      toolsCount: 1,
      enabled: true,
    };
    setServers((prev) => [...prev, newServer]);
    setNewServerName("");
    setShowAdd(false);
  };

  const handleRemove = (id: string) => {
    setServers((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-400">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Universal MCP Host Kernel (Model Context Protocol)
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Mount external MCP tools and standard protocol servers gated through Phryvos approval state machines.
            </p>
          </div>
        </div>

        <Button
          variant="secondary"
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs h-8 px-3"
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add MCP Server
        </Button>
      </div>

      {showAdd && (
        <div className="mb-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              placeholder="MCP Server Name (e.g. SQLite / Github MCP)..."
              className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-hidden"
            />
            <select
              value={newTransport}
              onChange={(e) => setNewTransport(e.target.value as "stdio" | "sse")}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-200"
            >
              <option value="stdio">stdio</option>
              <option value="sse">SSE (HTTP)</option>
            </select>
            <Button variant="primary" onClick={handleAdd} className="text-xs h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white">
              Mount
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {servers.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40"
          >
            <div className="flex items-center gap-3">
              <Server className="h-4 w-4 text-indigo-500" />
              <div>
                <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                  {s.name}
                </span>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500">
                  <span className="px-1.5 py-0.2 rounded bg-zinc-200 dark:bg-zinc-800 font-mono text-[10px]">
                    {s.transport}
                  </span>
                  <span>•</span>
                  <span>{s.toolsCount} Mounted Tools</span>
                  <span>•</span>
                  <span className="flex items-center text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-3 w-3 mr-1" /> Approval Gated
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleRemove(s.id)}
              className="text-zinc-400 hover:text-red-600 transition-colors p-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
