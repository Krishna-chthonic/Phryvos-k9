"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DotRoster } from "./DotRoster";
import { DotWorkspace } from "./DotWorkspace";
import { NewDotDialog } from "./NewDotDialog";
import { DotCallModal } from "./DotCallModal";
import type { DotDto, DotMessageDto, DotSpaceDto } from "@/lib/dots-service";
import { providersApi, type ProviderMeta } from "@/lib/chat-client";
import { Loader2 } from "lucide-react";

export function DotsApp() {
  const [dots, setDots] = useState<DotDto[]>([]);
  const [selectedDotId, setSelectedDotId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DotMessageDto[]>([]);
  const [spaces, setSpaces] = useState<DotSpaceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileRosterOpen, setMobileRosterOpen] = useState(false);
  const [desktopRosterOpen, setDesktopRosterOpen] = useState(true);
  const [newDotDialogOpen, setNewDotDialogOpen] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);

  // Provider & Model state
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [providerId, setProviderId] = useState<number | "">("");
  const [selectedModel, setSelectedModel] = useState<string>("");

  // Streaming state
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [pendingApproval, setPendingApproval] = useState<{
    id: string;
    tool: string;
    description: string;
  } | null>(null);
  const activeStreamAbortRef = React.useRef<AbortController | null>(null);

  const activeDot = dots.find((d) => d.id === selectedDotId) || dots[0] || null;

  // Stream crosstalk prevention on Dot switch (D-12)
  useEffect(() => {
    if (activeStreamAbortRef.current) {
      activeStreamAbortRef.current.abort();
      activeStreamAbortRef.current = null;
    }
    setStreaming(false);
    setStreamText("");
    setPendingApproval(null);
  }, [activeDot?.id]);

  // Clean unmount (D-12)
  useEffect(() => {
    return () => {
      if (activeStreamAbortRef.current) {
        activeStreamAbortRef.current.abort();
      }
    };
  }, []);

  // Load providers
  useEffect(() => {
    providersApi
      .list()
      .then((r) => {
        const list = r.providers || [];
        setProviders(list);
        const def = list.find((p) => p.isDefault) ?? list[0];
        if (def) {
          setProviderId(def.id);
          if (!selectedModel) {
            setSelectedModel(def.models[0] ?? "");
          }
        }
      })
      .catch((e) => console.error("Failed to load providers", e));
  }, []);

  // Sync model with activeDot (D-13)
  useEffect(() => {
    if (activeDot) {
      if (activeDot.model && activeDot.model !== "auto") {
        setSelectedModel(activeDot.model);
      } else if (providers.length > 0) {
        const p = providers.find((x) => x.id === providerId) ?? providers[0];
        if (p?.models?.[0]) {
          setSelectedModel(p.models[0]);
        }
      }
    }
  }, [activeDot?.id, activeDot?.model, providers, providerId]);

  // Load all dots
  const loadDots = useCallback(async () => {
    try {
      const res = await fetch("/api/dots");
      if (res.ok) {
        const data = await res.json();
        setDots(data.dots || []);
        if (!selectedDotId && data.dots && data.dots.length > 0) {
          setSelectedDotId(data.dots[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load dots", e);
    } finally {
      setLoading(false);
    }
  }, [selectedDotId]);

  // Load single dot details (messages & spaces)
  const loadDotDetails = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/dots/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        setSpaces(data.spaces || []);
      }
    } catch (e) {
      console.error("Failed to load dot details", e);
    }
  }, []);

  useEffect(() => {
    loadDots();
  }, [loadDots]);

  useEffect(() => {
    if (activeDot) {
      loadDotDetails(activeDot.id);
    }
  }, [activeDot?.id, loadDotDetails]);

  // Update provider / model handlers
  const handleSelectProvider = (pid: number | "") => {
    setProviderId(pid);
    const p = providers.find((x) => x.id === pid);
    if (p && p.models.length > 0) {
      const firstModel = p.models[0];
      setSelectedModel(firstModel);
      if (activeDot) {
        handleUpdateDot({ model: firstModel });
      }
    }
  };

  const handleSelectModel = (m: string) => {
    setSelectedModel(m);
    if (activeDot) {
      handleUpdateDot({ model: m });
    }
  };

  // Send message to active dot via SSE
  const handleSendMessage = async (content: string) => {
    if (!activeDot || streaming) return;

    // Abort any prior stream before starting a new one (D-12)
    if (activeStreamAbortRef.current) {
      activeStreamAbortRef.current.abort();
    }
    const ac = new AbortController();
    activeStreamAbortRef.current = ac;

    // Optimistic user message
    const tempId = `temp_${Date.now()}`;
    const userMsg: DotMessageDto = {
      id: tempId,
      dotId: activeDot.id,
      role: "user",
      content,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    setStreaming(true);
    setStreamText("");

    try {
      const res = await fetch(`/api/dots/${activeDot.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          content,
          model: selectedModel || undefined,
          providerId: providerId === "" ? undefined : providerId,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to communicate with Dot");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (!block.trim()) continue;
          const matchEvent = block.match(/^event:\s*(\w+)/m);
          const matchData = block.match(/^data:\s*(.*)$/m);
          const event = matchEvent ? matchEvent[1] : "message";
          const rawData = matchData ? matchData[1] : "";

          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(rawData);
          } catch {}

          if (event === "delta" && data.text) {
            accumulated += data.text as string;
            setStreamText(accumulated);
          } else if (event === "step") {
            const step = data as { tool?: string; result?: string };
            if (step.tool) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `tool_${Date.now()}_${Math.random()}`,
                  dotId: activeDot.id,
                  role: "tool",
                  content: step.result || "Executed tool " + step.tool,
                  toolName: step.tool,
                  createdAt: Date.now(),
                },
              ]);
            }
          } else if (event === "approval") {
            const appData = data as { approvalId?: string; tool?: string; description?: string };
            if (appData.approvalId) {
              setPendingApproval({
                id: appData.approvalId,
                tool: appData.tool || "Action",
                description: appData.description || "Destructive action requires confirmation",
              });
            }
          } else if (event === "error") {
            const errData = data as { message?: string };
            const errMsg = errData.message || "An error occurred during response generation";
            setMessages((prev) => [
              ...prev,
              {
                id: `err_${Date.now()}`,
                dotId: activeDot.id,
                role: "assistant",
                content: `⚠️ **Error:** ${errMsg}`,
                createdAt: Date.now(),
              },
            ]);
          }
        }
      }

      // Reload fresh messages from DB
      await loadDotDetails(activeDot.id);
      await loadDots();
    } catch (e) {
      if ((e as any)?.name === "AbortError") {
        // Stream aborted due to switching dots or intentional cancel - ignore cleanly (D-12)
        return;
      }
      console.error("Chat error", e);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          dotId: activeDot.id,
          role: "assistant",
          content: `⚠️ **Error:** ${e instanceof Error ? e.message : "Failed to communicate with Dot"}`,
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setStreaming(false);
      setStreamText("");
    }
  };

  const handleResolveApproval = async (approvalId: string, decision: "allow" | "deny") => {
    try {
      await fetch(`/api/chat/approvals/${approvalId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
    } catch (err) {
      console.error("Failed to resolve approval:", err);
    } finally {
      setPendingApproval(null);
    }
  };

  const handleDeleteDot = async (id: string) => {
    const targetDot = dots.find((d) => d.id === id);
    const name = targetDot?.name || "this AI coworker";
    if (
      !confirm(
        `Are you sure you want to permanently delete "${name}"? All associated tasks, spaces, and conversation history will be removed.`
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/dots/${id}`, { method: "DELETE" });
      if (res.ok) {
        const next = dots.filter((d) => d.id !== id);
        setDots(next);
        if (selectedDotId === id) {
          setSelectedDotId(next[0]?.id || null);
        }
      }
    } catch (err) {
      console.error("Failed to delete dot:", err);
    }
  };

  const handleUpdateDot = async (updates: Partial<DotDto>) => {
    if (!activeDot) return;
    try {
      const res = await fetch(`/api/dots/${activeDot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await loadDots();
      }
    } catch (e) {
      console.error("Failed to update dot", e);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-zinc-950">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Coworker Roster Sidebar */}
      <DotRoster
        dots={dots}
        selectedDotId={activeDot?.id || null}
        onSelectDot={(id) => setSelectedDotId(id)}
        onOpenNewDotDialog={() => setNewDotDialogOpen(true)}
        onDeleteDot={handleDeleteDot}
        mobileOpen={mobileRosterOpen}
        onCloseMobile={() => setMobileRosterOpen(false)}
        desktopOpen={desktopRosterOpen}
      />

      {/* Main Workspace */}
      {activeDot ? (
        <DotWorkspace
          dot={activeDot}
          messages={messages}
          spaces={spaces}
          onSendMessage={handleSendMessage}
          onRefreshSpaces={() => loadDotDetails(activeDot.id)}
          onOpenCall={() => setCallModalOpen(true)}
          onToggleRoster={() => setMobileRosterOpen((prev) => !prev)}
          onToggleDesktopRoster={() => setDesktopRosterOpen((prev) => !prev)}
          desktopRosterOpen={desktopRosterOpen}
          streaming={streaming}
          streamText={streamText}
          pendingApproval={pendingApproval}
          onResolveApproval={handleResolveApproval}
          onDeleteDot={handleDeleteDot}
          onUpdateDot={handleUpdateDot}
          providers={providers}
          providerId={providerId}
          selectedModel={selectedModel}
          onSelectProvider={handleSelectProvider}
          onSelectModel={handleSelectModel}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-zinc-400">
          No active Dot selected.
        </div>
      )}

      {/* New Dot Modal */}
      <NewDotDialog
        open={newDotDialogOpen}
        onClose={() => setNewDotDialogOpen(false)}
        onCreated={(newDot) => {
          setDots((prev) => [...prev, newDot]);
          setSelectedDotId(newDot.id);
        }}
      />

      {/* Voice Call Modal */}
      {activeDot && (
        <DotCallModal
          open={callModalOpen}
          onClose={() => setCallModalOpen(false)}
          name={activeDot.name}
          role={activeDot.role}
          character={activeDot.character}
          onSendMessage={handleSendMessage}
          lastAssistantMessage={
            messages
              .filter((m) => m.role === "assistant")
              .slice(-1)[0]?.content
          }
          isStreaming={streaming}
        />
      )}
    </div>
  );
}