/**
 * Main chat interface for phryvos-k9 with KaTeX math, session compaction, and dark mode.
 *
 * Importers/callers: app/(app)/chat/page.tsx
 * Affected API: /api/chat/sessions, /api/chat/sessions/:id/compact, /api/chat/sessions/:id/messages
 * Data schemas if any: ChatSessionMeta, ChatMessageDto
 * User instruction verbatim: "1. i want dual theme dark and light , 2. agar isme compaction ka system hota toh thik rahta like koi session jyada lamba ho gaya toh dikkat ho sakti hai , 3. ek memmory system bhi hona chahiye ai ke liye jisme vo points bana ke chijo ko permanentlt yaad rakhe jinko users khud se kahe ki ye chij yaad rakhna ya permanently save kar lo , 4. em aur badi dikkat like me kai mathematics quetions yaha karunga ya solutioms ai se lunga toh solution jo hai vo alag form me aa raje hai ( latex ) toh numerical values samajh me aye esa simplify chahiye , 5. aur ai ke paas kuch skills plugins bhi hone chahiye jo ki important hai like web search, web fetch, etc."
 */
"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Brain,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileDown,
  Folder,
  Globe,
  GraduationCap,
  ImagePlus,
  ListChecks,
  Loader2,
  Menu,
  MessageSquare,
  MoreVertical,
  PanelLeft,
  Pencil,
  PenTool,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Boxes,
  Sparkles,
  Square,
  Target,
  Terminal,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import {
  approvalsApi,
  chatApi,
  providersApi,
  type ChatMessageDto,
  type ChatSessionMeta,
  type ProviderMeta,
} from "@/lib/chat-client";
import type { UnifiedPart } from "@/lib/ai/types";
import {
  groupSessionsByDate,
  exportConversationAsMarkdown,
  exportConversationAsJson,
  triggerFileDownload,
  findConversationMatches,
  getDraftStorageKey,
} from "@/lib/chat-utils";
import {
  EFFORT_PRESETS,
  MODE_PRESETS,
  type EffortLevel,
  type AiMode,
} from "@/lib/ai/modes-and-effort";
import { ArtifactDrawer, type ArtifactItem } from "./ArtifactDrawer";
import { MemoryDrawer } from "./MemoryDrawer";
import type { VaultSourceCitation } from "./SourcesUsedPanel";
import { CitationCables, registerMonacoEditor, type Citation } from "./CitationCables";
import { MorningApprovalsFeed } from "./MorningApprovalsFeed";
import { WidgetRegistry } from "@/components/extensions/WidgetRegistry";
import type { StepEvt, ApprovalReq } from "./types";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { TokenRingGauge } from "./TokenRingGauge";
import { ModeAndEffortMenu } from "./ModeAndEffortMenu";
import { ApprovalDialog } from "./ApprovalDialog";
import { MessageRow, textOf } from "./MessageRow";
import { EditBox } from "./EditBox";

/* ---------------------------------------------------------------- helpers */

export function getModelContextLimit(modelName?: string | null): number {
  if (!modelName) return 128_000;
  const m = modelName.toLowerCase();
  if (m.includes("claude")) return 200_000;
  if (m.includes("gemini")) return 1_000_000;
  if (m.includes("gpt-4o") || m.includes("gpt-4-turbo") || m.includes("o1") || m.includes("o3")) return 128_000;
  if (m.includes("llama-3.1") || m.includes("llama-3.2") || m.includes("llama-3.3")) return 128_000;
  if (m.includes("llama-3") || m.includes("llama3")) return 8_192;
  if (m.includes("mistral") || m.includes("mixtral") || m.includes("qwen")) return 128_000;
  return 128_000;
}

function when(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

/* ---------------------------------------------------------------- suggestions */

const SUGGESTIONS = [
  {
    icon: Folder,
    title: "Search Vault Files",
    prompt: "Search my vault files and give me a summary of my recent notes.",
  },
  {
    icon: ListChecks,
    title: "Review Tasks & Projects",
    prompt: "List all my pending tasks and tell me what I should focus on today.",
  },
  {
    icon: GraduationCap,
    title: "Exam Study Plan",
    prompt: "Check my exam subjects and create a study plan with target milestones.",
  },
  {
    icon: Target,
    title: "Track Goals & Milestones",
    prompt: "Review my active goals and give me an update on current progress.",
  },
];




/* ---------------------------------------------------------------- ChatApp */

export function ChatApp() {
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [providerId, setProviderId] = useState<number | "">("");
  const [model, setModel] = useState("");
  const [draft, setDraft] = useState("");
  const [attach, setAttach] = useState<UnifiedPart[] | null>(null);
  const [streamText, setStreamText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [steps, setSteps] = useState<StepEvt[]>([]);
  const [approval, setApproval] = useState<ApprovalReq | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [turnStatus, setTurnStatus] = useState<"idle" | "streaming" | "stopped" | "failed">("idle");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewUnread, setHasNewUnread] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("phryvos_pinned_sessions");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });
  const activeSessionReqRef = useRef(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [desktopRailOpen, setDesktopRailOpen] = useState(true);
  const [compacting, setCompacting] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [streamElapsed, setStreamElapsed] = useState(0);
  const [artifact, setArtifact] = useState<ArtifactItem | null>(null);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [memoryDrawerOpen, setMemoryDrawerOpen] = useState(false);
  const [memoryDrawerSeedPoint, setMemoryDrawerSeedPoint] = useState<string>("");
  const [turnSources, setTurnSources] = useState<VaultSourceCitation[]>([]);
  const [morningFeedOpen, setMorningFeedOpen] = useState(false);
  const [widgetRegistryOpen, setWidgetRegistryOpen] = useState(false);
  const [citations, setCitations] = useState<Citation[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // CHAT-Feature B: In-conversation search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // CHAT-51: requestAnimationFrame streaming delta coalescing buffer
  const deltaBufferRef = useRef<string>("");
  const rafIdRef = useRef<number | null>(null);

  const flushDeltaBuffer = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (deltaBufferRef.current) {
      const chunk = deltaBufferRef.current;
      deltaBufferRef.current = "";
      setStreamText((prev) => prev + chunk);
    }
  }, []);

  // CHAT-54: Unmount cleanup for animation frame and abort controller
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      abortRef.current?.abort();
    };
  }, []);

  const [selectedMode, setSelectedMode] = useState<AiMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("phryvos_ai_mode");
      if (saved && saved in MODE_PRESETS) return saved as AiMode;
    }
    return "thinking";
  });

  const [selectedEffort, setSelectedEffort] = useState<EffortLevel>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("phryvos_ai_effort");
      if (saved && saved in EFFORT_PRESETS) return saved as EffortLevel;
    }
    return "medium";
  });

  const handleModeChange = useCallback((m: AiMode) => {
    setSelectedMode(m);
    if (typeof window !== "undefined") {
      localStorage.setItem("phryvos_ai_mode", m);
    }
    if (active) {
      chatApi.patchSession(active, { mode: m }).catch(() => {});
    }
  }, [active]);

  const handleEffortChange = useCallback((eff: EffortLevel) => {
    setSelectedEffort(eff);
    if (typeof window !== "undefined") {
      localStorage.setItem("phryvos_ai_effort", eff);
    }
    if (active) {
      chatApi.patchSession(active, { effort: eff }).catch(() => {});
    }
  }, [active]);

  const handleSaveToMemory = useCallback((text: string) => {
    setMemoryDrawerSeedPoint(text);
    setMemoryDrawerOpen(true);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (streaming) {
      setStreamElapsed(0);
      interval = setInterval(() => {
        setStreamElapsed((s) => s + 1);
      }, 1000);
    } else {
      setStreamElapsed(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [streaming]);

  const contextStats = useMemo(() => {
    let chars = 0;
    let imageCount = 0;
    for (const m of messages) {
      if (typeof m.content === "string") chars += m.content.length;
      else if (Array.isArray(m.content)) {
        for (const p of m.content) {
          if (p.type === "text" && p.text) chars += p.text.length;
          else if (p.type === "image") imageCount++;
        }
      }
    }
    if (streamText) chars += streamText.length;

    const baseOverheadTokens = 1500; // system prompt & mode instructions
    const toolsOverheadTokens = 2000; // registered agent tools
    const imagesTokens = imageCount * 1600; // vision token estimate
    const textTokens = Math.round(chars / 3.8);

    const estTokens = textTokens + baseOverheadTokens + toolsOverheadTokens + imagesTokens;
    const maxTokens = getModelContextLimit(model);
    const percent = Math.min(100, Math.round((estTokens / maxTokens) * 100));
    return { chars, estTokens, maxTokens, percent };
  }, [messages, streamText, model]);

  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadSessions = useCallback(async () => {
    try {
      const { sessions } = await chatApi.listSessions();
      setSessions(sessions);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load sessions");
    }
  }, []);

  useEffect(() => {
    loadSessions().then();
    providersApi
      .list()
      .then((r) => {
        setProviders(r.providers);
        const def = r.providers.find((p) => p.isDefault) ?? r.providers[0];
        if (def) {
          setProviderId(def.id);
          setModel(def.models[0] ?? "");
        }
      })
      .catch(() => {});
  }, [loadSessions]);

  const loadMessages = useCallback(
    async (sid: string) => {
      const reqId = ++activeSessionReqRef.current;
      try {
        const { session, messages } = await chatApi.getSession(sid);
        if (reqId !== activeSessionReqRef.current) return;
        setMessages(messages);
        setModel(session.model);
        setProviderId(session.providerId ?? "");
        if (session.mode && session.mode in MODE_PRESETS) {
          setSelectedMode(session.mode as AiMode);
        }
        if (session.effort && session.effort in EFFORT_PRESETS) {
          setSelectedEffort(session.effort as EffortLevel);
        }
        setActive(sid);
        setMobileRailOpen(false);
        // CHAT-Feature C: Restore session draft from sessionStorage
        if (typeof window !== "undefined") {
          try {
            const savedDraft = sessionStorage.getItem(getDraftStorageKey(sid)) || "";
            setDraft(savedDraft);
          } catch {}
        }
        setSessions((prev) =>
          prev.map((s) => (s.id === sid ? { ...s, ...session } : s)),
        );
        loadSessions();
      } catch (e) {
        if (reqId !== activeSessionReqRef.current) return;
        setErr(e instanceof Error ? e.message : "Failed to open chat");
      }
    },
    [loadSessions],
  );

  const togglePinSession = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("phryvos_pinned_sessions", JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  }, []);

  const handleRenameSession = useCallback(async (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      setEditingSessionId(null);
      return;
    }
    try {
      await chatApi.patchSession(id, { title: trimmed });
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: trimmed } : s)));
      setEditingSessionId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to rename session");
    }
  }, []);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await chatApi.deleteSession(id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
        setPinnedIds((prev) => prev.filter((x) => x !== id));
        if (id === active) {
          setActive(null);
          setMessages([]);
        }
        setConfirmDeleteId(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to delete session");
      }
    },
    [active],
  );

  const handleExportMarkdown = useCallback(() => {
    const s = sessions.find((x) => x.id === active);
    if (!s) return;
    const md = exportConversationAsMarkdown(s, messages);
    const filename = `${(s.title || "conversation").toLowerCase().replace(/[^a-z0-9_-]/g, "_")}.md`;
    triggerFileDownload(md, filename, "text/markdown");
    setMoreMenuOpen(false);
  }, [active, sessions, messages]);

  const handleExportJson = useCallback(() => {
    const s = sessions.find((x) => x.id === active);
    if (!s) return;
    const jsonStr = exportConversationAsJson(s, messages);
    const filename = `${(s.title || "conversation").toLowerCase().replace(/[^a-z0-9_-]/g, "_")}.json`;
    triggerFileDownload(jsonStr, filename, "application/json");
    setMoreMenuOpen(false);
  }, [active, sessions, messages]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setHasNewUnread(false);
    }
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    setIsAtBottom(true);
    setHasNewUnread(false);
  }, []);

  const handleDraftChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDraft(val);
    if (active && typeof window !== "undefined") {
      try {
        if (val) {
          sessionStorage.setItem(getDraftStorageKey(active), val);
        } else {
          sessionStorage.removeItem(getDraftStorageKey(active));
        }
      } catch {}
    }
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      const nextH = Math.min(Math.max(ta.scrollHeight, 38), 180);
      ta.style.height = `${nextH}px`;
    }
  }, [active]);

  const resetTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "38px";
    }
  }, []);

  const handleCompact = useCallback(async () => {
    if (!active || compacting || streaming) return;
    setCompacting(true);
    setErr(null);
    try {
      const res = await chatApi.compactSession(active);
      if (res.ok) {
        await loadMessages(active);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to compact conversation");
    } finally {
      setCompacting(false);
    }
  }, [active, compacting, streaming, loadMessages]);

  const newChat = useCallback(async () => {
    if (busy || streaming) return;
    setBusy(true);
    setErr(null);
    try {
      const pid = providerId === "" ? null : providerId;
      const m =
        model || (providers.find((p) => p.id === pid)?.models[0] ?? "auto");
      const { session } = await chatApi.createSession({
        model: m,
        providerId: pid,
        mode: selectedMode,
        effort: selectedEffort,
      });
      setSessions((s) => [session, ...s]);
      setActive(session.id);
      setMessages([]);
      setDraft("");
      setMobileRailOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create chat");
    } finally {
      setBusy(false);
    }
  }, [busy, streaming, providerId, model, providers, selectedMode, selectedEffort]);

  const pickProvider = useCallback(
    async (id: number | "") => {
      setProviderId(id);
      const p = providers.find((x) => x.id === id);
      const newModel = p?.models?.length ? p.models[0] : model;
      if (newModel) setModel(newModel);
      if (active) {
        try {
          await chatApi.patchSession(active, {
            providerId: id === "" ? null : id,
            model: newModel || undefined,
          });
          loadSessions();
        } catch {
          /* session may not exist yet — applied on creation */
        }
      }
    },
    [active, providers, model, loadSessions],
  );

  const pickModel = useCallback(
    async (newModel: string) => {
      setModel(newModel);
      if (active) {
        try {
          await chatApi.patchSession(active, { model: newModel });
          loadSessions();
        } catch {
          /* session may not exist yet */
        }
      }
    },
    [active, loadSessions],
  );

  const send = useCallback(
    async (body: {
      content?: string | UnifiedPart[];
      model?: string;
      regenerate?: boolean;
      effort?: EffortLevel;
      mode?: AiMode;
    }) => {
      if (streaming) return;
      setErr(null);
      setEditing(null);
      setTurnStatus("streaming");

      let targetSessionId = active;

      // Auto-create session if user hasn't created one yet
      if (!targetSessionId) {
        const pid = providerId === "" ? null : providerId;
        const m =
          model || (providers.find((p) => p.id === pid)?.models[0] ?? "auto");
        try {
          const { session } = await chatApi.createSession({
            model: m,
            providerId: pid,
            mode: selectedMode,
            effort: selectedEffort,
          });
          setSessions((s) => [session, ...s]);
          setActive(session.id);
          targetSessionId = session.id;
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Failed to start chat session");
          setTurnStatus("failed");
          return;
        }
      }

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStreaming(true);
      setStreamText("");
      setSteps([]);
      setApproval(null);
      setApprovalError(null);
      setTurnSources([]);

      try {
        // optimistic user bubble
        if (body.content) {
          setMessages((ms) => [
            ...ms,
            {
              id: `local_${Date.now()}`,
              seq: ms.length,
              role: "user",
              content: body.content as string | UnifiedPart[],
              toolCalls: null,
              toolCallId: null,
              editedAt: null,
              createdAt: Date.now(),
            },
          ]);
          setDraft("");
          if (targetSessionId && typeof window !== "undefined") {
            try {
              sessionStorage.removeItem(getDraftStorageKey(targetSessionId));
            } catch {}
          }
          setAttach(null);
        }
        await chatApi.sendMessage(
          targetSessionId,
          {
            ...body,
            effort: body.effort ?? selectedEffort,
            mode: body.mode ?? selectedMode,
          },
          (ev, data) => {
            let d: Record<string, unknown>;
            try {
              d = JSON.parse(data || "{}");
            } catch {
              return;
            }
            if (ev === "delta") {
              const textChunk = (d.text as string) ?? "";
              deltaBufferRef.current += textChunk;
              if (rafIdRef.current === null) {
                rafIdRef.current = requestAnimationFrame(() => {
                  rafIdRef.current = null;
                  const chunk = deltaBufferRef.current;
                  deltaBufferRef.current = "";
                  setStreamText((prev) => prev + chunk);
                });
              }
            }
            else if (ev === "sources") {
              flushDeltaBuffer();
              const srcList = (d.sources as unknown as VaultSourceCitation[]) || [];
              setTurnSources(srcList);
            }
            else if (ev === "step") {
              flushDeltaBuffer();
              const stepEvt = d as unknown as StepEvt;
              setSteps((s) => [...s, stepEvt]);
              // Check if this step created a physics artifact or HTML artifact
              if (stepEvt.tool === "render_physics_problem" && stepEvt.result) {
                try {
                  const result = JSON.parse(stepEvt.result);
                  if (result.type && result.params) {
                    const artifactItem: ArtifactItem = {
                      id: `physics-${stepEvt.toolCallId}`,
                      title: result.type,
                      type: "physics",
                      content: "",
                      params: result.params,
                      createdAt: Date.now(),
                    };
                    setArtifact(artifactItem);
                    setArtifactOpen(true);
                  }
                } catch {
                  // Ignore parse errors
                }
              } else if (stepEvt.tool === "write_file" && typeof stepEvt.args.path === "string" && stepEvt.args.path.endsWith(".html")) {
                // Auto-open HTML artifacts
                const artifactItem: ArtifactItem = {
                  id: `html-${stepEvt.toolCallId}`,
                  title: stepEvt.args.path.split("/").pop() || "HTML Artifact",
                  type: "html",
                  content: typeof stepEvt.args.content === "string" ? stepEvt.args.content : "",
                  createdAt: Date.now(),
                };
                setArtifact(artifactItem);
                setArtifactOpen(true);
              }
            }
            else if (ev === "approval") {
              flushDeltaBuffer();
              setApproval(d as unknown as ApprovalReq);
              setApprovalError(null);
            }
            else if (ev === "done") {
              flushDeltaBuffer();
              setApproval(null);
              setTurnStatus("idle");
            }
            else if (ev === "error") {
              flushDeltaBuffer();
              setErr(String(d.message ?? "Provider error"));
              setTurnStatus("failed");
            }
          },
          ctrl.signal,
        );
      } catch (e) {
        flushDeltaBuffer();
        if (ctrl.signal.aborted) {
          setTurnStatus("stopped");
        } else {
          setTurnStatus("failed");
          const msg = e instanceof Error ? e.message : "Request failed";
          setErr(
            msg.includes("503") || msg.includes("lock")
              ? "Vault locked — unlock to continue."
              : msg,
          );
        }
      } finally {
        flushDeltaBuffer();
        setStreaming(false);
        setStreamText("");
        setSteps([]);
        setApproval(null);
        setApproving(false);
        abortRef.current = null;
        // Resync with server persisted messages even after abort/error to clear optimistic bubbles
        if (targetSessionId) {
          try {
            await loadMessages(targetSessionId);
          } catch {
            /* ignore resync failure */
          }
        }
      }
    },
    [active, streaming, providerId, model, providers, loadMessages, selectedEffort, selectedMode, flushDeltaBuffer],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setTurnStatus("stopped");
  }, []);

  const resolveApproval = useCallback(async (id: string, decision: "allow" | "deny") => {
    setApproving(true);
    setApprovalError(null);
    try {
      await approvalsApi.resolve(id, decision);
      setApproval(null);
    } catch (e) {
      setApprovalError(e instanceof Error ? e.message : "Approval request failed");
    } finally {
      setApproving(false);
    }
  }, []);

  const startEdit = useCallback((msg: ChatMessageDto) => {
    setEditing({ id: msg.id, text: textOf(msg.content) });
  }, []);

  const saveEdit = useCallback(
    async (regenerateAfter: boolean) => {
      if (!active || !editing) return;
      setBusy(true);
      setErr(null);
      try {
        const { messages: fresh } = await chatApi.editMessage(
          active,
          editing.id,
          editing.text,
          regenerateAfter,
        );
        setMessages(fresh);
        setEditing(null);
        loadSessions();
        if (regenerateAfter) {
          await send({ regenerate: true });
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Edit failed");
      } finally {
        setBusy(false);
      }
    },
    [active, editing, loadSessions, send],
  );

  // Feature A: Conversation Branching from any message
  const handleFork = useCallback(
    async (cutoffMessageId: string) => {
      if (!active || streaming || busy) return;
      setBusy(true);
      setErr(null);
      try {
        const res = await chatApi.forkSession(active, { cutoffMessageId });
        setSessions((prev) => [res.session, ...prev]);
        setActive(res.session.id);
        setMessages(res.messages);
        setModel(res.session.model);
        setProviderId(res.session.providerId ?? "");
        if (res.session.mode && res.session.mode in MODE_PRESETS) {
          setSelectedMode(res.session.mode as AiMode);
        }
        if (res.session.effort && res.session.effort in EFFORT_PRESETS) {
          setSelectedEffort(res.session.effort as EffortLevel);
        }
        setMobileRailOpen(false);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to branch conversation");
      } finally {
        setBusy(false);
      }
    },
    [active, streaming, busy],
  );

  // Feature D: Turn-level Helpful/Unhelpful feedback
  const handleFeedback = useCallback(
    async (msgId: string, feedback: "helpful" | "unhelpful" | null) => {
      if (!active) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, feedback } : m)),
      );
      try {
        await chatApi.setFeedback(active, msgId, feedback);
      } catch (e) {
        console.warn("[Feedback] Failed to record feedback:", e);
      }
    },
    [active],
  );

  // Feature B: In-conversation search matches and navigation
  const searchMatches = useMemo(() => {
    if (!searchOpen || !searchQuery.trim()) return [];
    return findConversationMatches(messages, searchQuery);
  }, [searchOpen, searchQuery, messages]);

  useEffect(() => {
    setActiveMatchIdx(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!searchOpen || searchMatches.length === 0) return;
    const match = searchMatches[activeMatchIdx];
    if (match) {
      const el = document.getElementById(`message-${match.messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [searchOpen, searchMatches, activeMatchIdx]);

  const nextSearchMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setActiveMatchIdx((prev) => (prev + 1) % searchMatches.length);
  }, [searchMatches.length]);

  const prevSearchMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    setActiveMatchIdx((prev) => (prev - 1 + searchMatches.length) % searchMatches.length);
  }, [searchMatches.length]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setActiveMatchIdx(0);
  }, []);

  // CHAT-50: Global Keyboard Shortcuts & Accessibility Hierarchy
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K: Focus composer
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        textareaRef.current?.focus();
        return;
      }

      // Ctrl+F / Cmd+F: Toggle in-conversation search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        if (active && messages.length > 0) {
          e.preventDefault();
          setSearchOpen((prev) => {
            const next = !prev;
            if (next) {
              setTimeout(() => searchInputRef.current?.focus(), 50);
            } else {
              setSearchQuery("");
              setActiveMatchIdx(0);
            }
            return next;
          });
        }
        return;
      }

      // Escape hierarchy
      if (e.key === "Escape") {
        if (searchOpen) {
          e.preventDefault();
          closeSearch();
          return;
        }
        if (editing) {
          e.preventDefault();
          setEditing(null);
          return;
        }
        if (confirmDeleteId) {
          e.preventDefault();
          setConfirmDeleteId(null);
          return;
        }
        if (moreMenuOpen) {
          e.preventDefault();
          setMoreMenuOpen(false);
          return;
        }
        if (mobileRailOpen) {
          e.preventDefault();
          setMobileRailOpen(false);
          return;
        }
        if (artifactOpen) {
          e.preventDefault();
          setArtifactOpen(false);
          return;
        }
        if (memoryDrawerOpen) {
          e.preventDefault();
          setMemoryDrawerOpen(false);
          return;
        }
        if (morningFeedOpen) {
          e.preventDefault();
          setMorningFeedOpen(false);
          return;
        }
        if (widgetRegistryOpen) {
          e.preventDefault();
          setWidgetRegistryOpen(false);
          return;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    active,
    messages.length,
    searchOpen,
    closeSearch,
    editing,
    confirmDeleteId,
    moreMenuOpen,
    mobileRailOpen,
    artifactOpen,
    memoryDrawerOpen,
    morningFeedOpen,
    widgetRegistryOpen,
  ]);

  const pickAttachment = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setErr(null);
    const allowedMimes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    const fileList = Array.from(files);

    if (fileList.length > 4) {
      setErr("Maximum 4 image attachments allowed per message.");
      return;
    }

    let totalBytes = 0;
    for (const f of fileList) {
      if (!allowedMimes.includes(f.type.toLowerCase())) {
        setErr(`Unsupported file type '${f.name}'. Only PNG, JPEG, WEBP, and GIF images are allowed.`);
        return;
      }
      if (f.size > 5 * 1024 * 1024) {
        setErr(`File '${f.name}' exceeds the 5MB size limit.`);
        return;
      }
      totalBytes += f.size;
    }

    if (totalBytes > 10 * 1024 * 1024) {
      setErr("Total attachment size exceeds the 10MB limit.");
      return;
    }

    const parts: UnifiedPart[] = [];
    for (const f of fileList) {
      const b64 = (await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(f);
      })) as string;
      parts.push({ type: "image", dataBase64: b64, mediaType: f.type || "image/png" });
    }
    setAttach(parts);
  }, []);

  const sendContent = (): string | UnifiedPart[] | undefined => {
    const t = draft.trim();
    if (t && attach?.length) return [...attach, { type: "text", text: t }];
    if (t) return t;
    return attach ?? undefined;
  };

  const canSend = (!!draft.trim() || !!attach?.length) && !streaming;
  const activeSession = sessions.find((s) => s.id === active);
  const lastMsg = messages[messages.length - 1];
  const provider = providers.find((p) => p.id === providerId);
  const modelOptions = provider?.models?.length ? provider.models : model ? [model] : [];

  /** toolCallId → tool function name */
  const toolNames = new Map<string, string>();
  for (const m of messages)
    for (const tc of m.toolCalls ?? [])
      toolNames.set((tc as { id: string }).id, (tc as { name: string }).name);

  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    if (moreMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [moreMenuOpen]);

  const { pinnedSessions, sections } = useMemo(() => {
    const pinnedSet = new Set(pinnedIds);
    const pinned = sessions.filter((s) => pinnedSet.has(s.id));
    const unpinned = sessions.filter((s) => !pinnedSet.has(s.id));
    const grouped = groupSessionsByDate(unpinned);
    return {
      pinnedSessions: pinned,
      sections: [
        { label: "Today", items: grouped.today },
        { label: "Yesterday", items: grouped.yesterday },
        { label: "Previous 7 Days", items: grouped.last7Days },
        { label: "Older", items: grouped.older },
      ],
    };
  }, [sessions, pinnedIds]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (isAtBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: streaming ? "auto" : "smooth" });
    } else {
      setHasNewUnread(true);
    }
  }, [streamText, messages.length, isAtBottom, streaming]);

  useEffect(() => {
    scrollToBottom(false);
  }, [active, scrollToBottom]);

  const renderSessionItem = (s: ChatSessionMeta) => {
    const isPinned = pinnedIds.includes(s.id);
    const isEditing = editingSessionId === s.id;

    if (isEditing) {
      return (
        <div key={s.id} className="flex items-center gap-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-850 px-2.5 py-1.5 my-0.5">
          <input
            type="text"
            value={editingSessionTitle}
            onChange={(e) => setEditingSessionTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSession(s.id, editingSessionTitle);
              else if (e.key === "Escape") setEditingSessionId(null);
            }}
            autoFocus
            onBlur={() => handleRenameSession(s.id, editingSessionTitle)}
            className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs text-zinc-800 dark:text-zinc-200 outline-none"
          />
        </div>
      );
    }

    return (
      <div
        key={s.id}
        onClick={() => !streaming && loadMessages(s.id)}
        className={`group flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition-all my-0.5 ${
          s.id === active
            ? "bg-zinc-200/90 font-medium text-zinc-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100"
            : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
        }`}
      >
        <MessageSquare
          className={`h-4 w-4 shrink-0 ${
            s.id === active ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400"
          }`}
        />
        <span className="min-w-0 flex-1 truncate text-xs" title={s.title || "New chat"}>
          {s.title || "New chat"}
        </span>
        <span
          className={`shrink-0 text-[10px] ${
            s.id === active ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-400"
          }`}
        >
          {when(s.updatedAt || s.createdAt)}
        </span>

        {/* Hover / mobile actions */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition">
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePinSession(s.id);
            }}
            className={`flex h-6 w-6 items-center justify-center rounded-md hover:bg-zinc-200/70 dark:hover:bg-zinc-750 ${
              isPinned ? "text-amber-500" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            }`}
            title={isPinned ? "Unpin chat" : "Pin chat"}
            aria-label={isPinned ? "Unpin chat" : "Pin chat"}
          >
            {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditingSessionId(s.id);
              setEditingSessionTitle(s.title || "");
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/70 dark:hover:text-zinc-300 dark:hover:bg-zinc-750"
            title="Rename chat"
            aria-label="Rename chat"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDeleteId(s.id);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
            title="Delete chat"
            aria-label="Delete chat"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Mobile History Backdrop */}
      {mobileRailOpen && (
        <div
          onClick={() => setMobileRailOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Session Rail (Desktop Collapsible & Mobile Slide-over Drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-zinc-200 bg-white transition-all duration-300 ease-in-out md:static dark:border-zinc-800 dark:bg-zinc-950 ${
          mobileRailOpen ? "translate-x-0 shadow-2xl w-72" : "-translate-x-full md:translate-x-0"
        } ${
          desktopRailOpen ? "md:w-64" : "md:w-0 md:border-r-0 md:overflow-hidden"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-3.5">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Chat History
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={newChat}
              disabled={busy || streaming}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              title="New chat"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New</span>
            </button>
            <button
              onClick={() => setMobileRailOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDesktopRailOpen(false)}
              className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              title="Collapse chat history"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-400">
              No conversations yet. Start one!
            </div>
          ) : (
            <>
              {pinnedSessions.length > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                    <Pin className="h-3 w-3" />
                    <span>Pinned</span>
                  </div>
                  {pinnedSessions.map(renderSessionItem)}
                </div>
              )}
              {sections.map(
                (sec) =>
                  sec.items.length > 0 && (
                    <div key={sec.label} className="mb-2">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        {sec.label}
                      </div>
                      {sec.items.map(renderSessionItem)}
                    </div>
                  ),
              )}
            </>
          )}
        </div>

        {providers.length === 0 && (
          <div className="border-t border-zinc-100 dark:border-zinc-800 bg-amber-50/60 dark:bg-amber-950/30 p-3 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            No AI provider linked. Add one in{" "}
            <a href="/settings" className="font-semibold underline">
              Settings
            </a>{" "}
            to start chatting.
          </div>
        )}
      </aside>

      {/* Main Chat View */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
        {/* Single Consolidated Chat Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800 px-2 sm:px-3 md:px-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm gap-1.5 sm:gap-2">
          {/* Left section: Navigation & History controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {/* Mobile Main Menu Drawer trigger */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("phryvos:open-menu"))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-zinc-100 active:scale-95 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 md:hidden shrink-0"
              title="Open Navigation Menu"
              aria-label="Open Navigation Menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            {/* Mobile Chat History trigger */}
            <button
              onClick={() => setMobileRailOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 transition hover:bg-zinc-100 active:scale-95 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 md:hidden shrink-0"
              title="Chat History"
              aria-label="Chat History"
            >
              <PanelLeft className="h-4 w-4" />
            </button>

            {/* Desktop Chat History toggle */}
            <button
              onClick={() => setDesktopRailOpen((p) => !p)}
              className="hidden md:flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 transition shrink-0"
              title="Toggle chat history"
              aria-label="Toggle chat history"
            >
              <PanelLeft className="h-4 w-4" />
              <span className="hidden lg:inline">Chats</span>
            </button>

            {/* Active Session Title (Click to rename) */}
            {activeSession && editingSessionId === activeSession.id ? (
              <input
                type="text"
                value={editingSessionTitle}
                onChange={(e) => setEditingSessionTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSession(activeSession.id, editingSessionTitle);
                  else if (e.key === "Escape") setEditingSessionId(null);
                }}
                autoFocus
                onBlur={() => handleRenameSession(activeSession.id, editingSessionTitle)}
                className="h-7 max-w-[140px] sm:max-w-[200px] rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200 outline-none"
              />
            ) : (
              <span
                onClick={() => {
                  if (activeSession) {
                    setEditingSessionId(activeSession.id);
                    setEditingSessionTitle(activeSession.title || "");
                  }
                }}
                className="hidden sm:inline truncate text-xs md:text-sm font-semibold text-zinc-800 dark:text-zinc-100 max-w-[100px] md:max-w-[180px] cursor-pointer hover:underline"
                title="Click to rename"
              >
                {activeSession ? activeSession.title || "New chat" : "AI Assistant"}
              </span>
            )}

            {/* Model & Provider Selector */}
            <div className="flex items-center gap-1 min-w-0">
              {providers.length > 1 && (
                <select
                  value={String(providerId)}
                  onChange={(e) =>
                    pickProvider(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="h-8 max-w-[85px] sm:max-w-[120px] truncate rounded-lg border border-zinc-200 bg-zinc-50 px-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none"
                  title="Select Provider"
                >
                  <option value="">No provider</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              {modelOptions.length > 0 ? (
                <select
                  value={model}
                  onChange={(e) => pickModel(e.target.value)}
                  className="h-8 max-w-[110px] xs:max-w-[140px] sm:max-w-[180px] truncate rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none"
                  title="Model"
                >
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  onBlur={(e) => pickModel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") pickModel(model);
                  }}
                  placeholder="model id…"
                  className="h-8 w-24 sm:w-32 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none"
                />
              )}
            </div>
          </div>

          {/* Right section: Tokens ring gauge, retry button, More Actions popover (CHAT-45) */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Circular Token Gauge Ring */}
            {active && messages.length > 0 && (
              <TokenRingGauge
                estTokens={contextStats.estTokens}
                maxTokens={contextStats.maxTokens}
                percent={contextStats.percent}
                onCompact={handleCompact}
                canCompact={Boolean(active && messages.length >= 2 && !streaming)}
                compacting={compacting}
              />
            )}

            {/* Retry Button */}
            {!streaming && lastMsg?.role === "assistant" && (
              <button
                onClick={() => send({ regenerate: true })}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-2xs hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-zinc-600 dark:text-zinc-300 transition"
                title="Regenerate last reply"
                aria-label="Retry"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Permanent Memory Drawer trigger (CHAT-27) */}
            <button
              onClick={() => {
                setMemoryDrawerSeedPoint("");
                setMemoryDrawerOpen(true);
              }}
              className="flex h-8 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 shadow-2xs hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-zinc-600 dark:text-zinc-300 transition text-xs font-medium cursor-pointer"
              title="Permanent Memory & Provenance"
              aria-label="Permanent Memory"
            >
              <Brain className="h-3.5 w-3.5 text-purple-500" />
              <span className="hidden sm:inline">Memory</span>
            </button>

            {/* In-conversation Search Trigger (Feature B) */}
            {active && messages.length > 0 && (
              <button
                onClick={() => {
                  setSearchOpen((o) => {
                    const next = !o;
                    if (next) setTimeout(() => searchInputRef.current?.focus(), 50);
                    else {
                      setSearchQuery("");
                      setActiveMatchIdx(0);
                    }
                    return next;
                  });
                }}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-2xs hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-zinc-600 dark:text-zinc-300 transition cursor-pointer ${
                  searchOpen ? "bg-zinc-150 dark:bg-zinc-800 ring-2 ring-zinc-400" : ""
                }`}
                title="Search in conversation (Ctrl+F)"
                aria-label="Search conversation"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Consolidated More Actions Dropdown Menu (CHAT-45) */}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setMoreMenuOpen((o) => !o)}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-2xs hover:bg-zinc-50 active:scale-95 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-zinc-600 dark:text-zinc-300 transition cursor-pointer ${
                  moreMenuOpen ? "bg-zinc-150 dark:bg-zinc-800 ring-2 ring-zinc-400" : ""
                }`}
                title="More Actions"
                aria-label="More Actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {moreMenuOpen && (
                <div className="absolute right-0 top-10 z-50 w-56 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 animate-in fade-in-50 zoom-in-95">
                  {/* Export actions (CHAT-44) */}
                  {active && (
                    <>
                      <button
                        onClick={handleExportMarkdown}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 transition cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5 text-zinc-500" />
                        <span>Export as Markdown</span>
                      </button>
                      <button
                        onClick={handleExportJson}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 transition cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5 text-zinc-500" />
                        <span>Export as JSON</span>
                      </button>
                      <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                    </>
                  )}

                  {/* Compact conversation */}
                  {active && messages.length >= 2 && (
                    <button
                      onClick={() => {
                        handleCompact();
                        setMoreMenuOpen(false);
                      }}
                      disabled={compacting || streaming}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-900 transition cursor-pointer"
                    >
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      <span>{compacting ? "Compacting…" : "Compact History"}</span>
                    </button>
                  )}

                  {/* Governance */}
                  <button
                    onClick={() => {
                      setMorningFeedOpen(true);
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 transition cursor-pointer"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                    <span>Autonomous Governance</span>
                  </button>

                  {/* Permanent Memory (CHAT-27) */}
                  <button
                    onClick={() => {
                      setMemoryDrawerSeedPoint("");
                      setMemoryDrawerOpen(true);
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 transition cursor-pointer"
                  >
                    <Brain className="h-3.5 w-3.5 text-purple-500" />
                    <span>Permanent Memory</span>
                  </button>

                  {/* Artifacts Drawer (CHAT-36) */}
                  {artifact && (
                    <button
                      onClick={() => {
                        setArtifactOpen(true);
                        setMoreMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 transition cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
                      <span>View Artifact</span>
                    </button>
                  )}

                  {/* Widgets */}
                  <button
                    onClick={() => {
                      setWidgetRegistryOpen(true);
                      setMoreMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 transition cursor-pointer"
                  >
                    <Boxes className="h-3.5 w-3.5 text-indigo-500" />
                    <span>Safe Extensions & Tools</span>
                  </button>

                  {/* Rename / Delete for active session */}
                  {active && (
                    <>
                      <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                      <button
                        onClick={() => {
                          setMoreMenuOpen(false);
                          if (activeSession) {
                            setEditingSessionId(activeSession.id);
                            setEditingSessionTitle(activeSession.title || "");
                          }
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900 transition cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5 text-zinc-500" />
                        <span>Rename Chat</span>
                      </button>
                      <button
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setConfirmDeleteId(active);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 transition cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        <span>Delete Chat</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search Bar Drawer (Feature B) */}
        {searchOpen && (
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-900/90 backdrop-blur-xs px-3 py-2 text-xs gap-2">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <Search className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) prevSearchMatch();
                    else nextSearchMatch();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    closeSearch();
                  }
                }}
                placeholder="Find in conversation… (Enter / Shift+Enter)"
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                {searchQuery.trim()
                  ? searchMatches.length > 0
                    ? `${activeMatchIdx + 1} of ${searchMatches.length}`
                    : "No matches"
                  : ""}
              </span>
              <button
                type="button"
                onClick={prevSearchMatch}
                disabled={searchMatches.length <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-30 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                title="Previous match (Shift+Enter)"
                aria-label="Previous match"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={nextSearchMatch}
                disabled={searchMatches.length <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-30 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                title="Next match (Enter)"
                aria-label="Next match"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={closeSearch}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition cursor-pointer"
                title="Close search (Escape)"
                aria-label="Close search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {err && (
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
            <span className="flex-1 font-medium">{err}</span>
            <button onClick={() => setErr(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Message Stream or ChatGPT / Gemini Hero Welcome */}
        <div className="relative min-h-0 flex-1 overflow-hidden flex flex-col">
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-y-auto py-4 bg-white dark:bg-zinc-950"
          >
          {!active && messages.length === 0 && !streamText && !streaming ? (
            <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center px-4 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-lg ring-4 ring-zinc-100 dark:bg-zinc-800 dark:ring-zinc-800">
                <Sparkles className="h-7 w-7 text-emerald-400" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                What can I help with today?
              </h2>
              <p className="mt-1.5 text-xs md:text-sm text-zinc-500 dark:text-zinc-400 max-w-xl">
                I am connected to your encrypted personal vault. I can read & write files, manage tasks, plan exams, compute math, and search the web.
              </p>

              {/* 4 Interactive Suggestion Cards */}
              <div className="mt-8 grid w-full grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                {SUGGESTIONS.map((s, idx) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setDraft(s.prompt);
                        textareaRef.current?.focus();
                      }}
                      className="group flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-2xs transition hover:border-zinc-400 hover:shadow-xs active:scale-[0.99] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 group-hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:group-hover:bg-zinc-700 transition">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          {s.title}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                        {s.prompt}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-5xl px-3 sm:px-6 lg:px-8">
              {/* Compaction notice banner if session was summarized */}
              {activeSession && (activeSession.summaryUntil ?? 0) > 0 && (
                <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs dark:border-indigo-900/50 dark:bg-indigo-950/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium text-indigo-900 dark:text-indigo-200">
                      <Zap className="h-4 w-4 text-amber-500 shrink-0" />
                      <span>Context Compacted: Earlier conversation condensed into summary</span>
                    </div>
                    {activeSession.summary && (
                      <button
                        onClick={() => setSummaryExpanded((o) => !o)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:underline dark:text-indigo-400"
                      >
                        {summaryExpanded ? (
                          <>
                            Hide summary <ChevronUp className="h-3 w-3" />
                          </>
                        ) : (
                          <>
                            View summary <ChevronDown className="h-3 w-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  {summaryExpanded && activeSession.summary && (
                    <div className="mt-2.5 rounded-lg border border-indigo-200/60 bg-white/90 p-3 text-zinc-700 whitespace-pre-wrap leading-relaxed dark:border-indigo-800/60 dark:bg-zinc-900 dark:text-zinc-300">
                      {activeSession.summary}
                    </div>
                  )}
                </div>
              )}

              {messages.map((m) => {
                if (editing?.id === m.id) {
                  return (
                    <EditBox
                      key={m.id}
                      value={editing.text}
                      onChange={(v) => setEditing((e) => (e ? { ...e, text: v } : e))}
                      onSave={() => saveEdit(false)}
                      onSaveAndRegenerate={() => saveEdit(true)}
                      onCancel={() => setEditing(null)}
                      busy={busy}
                    />
                  );
                }
                const name =
                  m.role === "tool" && m.toolCallId
                    ? (toolNames.get(m.toolCallId) ?? undefined)
                    : undefined;
                return (
                  <MessageRow
                    key={m.id}
                    msg={m}
                    toolName={name}
                    onEdit={startEdit}
                    onFork={handleFork}
                    onFeedback={handleFeedback}
                    onSaveToMemory={handleSaveToMemory}
                    searchQuery={searchOpen ? searchQuery : undefined}
                    activeMatchIndex={
                      searchOpen && searchMatches[activeMatchIdx]?.messageId === m.id
                        ? activeMatchIdx
                        : undefined
                    }
                  />
                );
              })}
              {(streaming || streamText || steps.length > 0) && (
                <MessageRow
                  msg={{
                    id: "stream",
                    seq: -1,
                    role: "assistant",
                    content: streamText,
                    toolCalls: null,
                    toolCallId: null,
                    editedAt: null,
                    createdAt: Date.now(),
                  }}
                  streaming={streaming}
                  elapsed={streamElapsed}
                  liveSteps={steps}
                  sources={turnSources}
                  onEdit={() => {}}
                  onSaveToMemory={handleSaveToMemory}
                />
              )}
              {!streaming && (turnStatus === "stopped" || turnStatus === "failed") && (
                <div className="my-3 flex items-center justify-between rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>
                      {turnStatus === "stopped"
                        ? "Generation stopped by user."
                        : "Generation failed or was interrupted."}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => send({ regenerate: true })}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 transition cursor-pointer select-none"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Retry generation</span>
                  </button>
                </div>
              )}
            </div>
          )}
          </div>

          {/* Floating Jump to latest pill (CHAT-09, CHAT-13) */}
          {!isAtBottom && (
            <button
              onClick={() => scrollToBottom(true)}
              className="absolute bottom-3 right-5 z-20 flex items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white/95 px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-md backdrop-blur-xs transition hover:bg-zinc-100 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900/95 dark:text-zinc-200 dark:hover:bg-zinc-850 cursor-pointer active:scale-95"
              title="Jump to latest message"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              <span>Latest</span>
              {hasNewUnread && (
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
          )}
        </div>

        {/* Composer (ChatGPT/Gemini rounded pill style with ArrowUp mobile send button) */}
        <div className="shrink-0 border-t border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 px-3 py-3 md:px-4">
          <div className="mx-auto w-full max-w-5xl">
            {approval && (
              <ApprovalDialog
                approval={approval}
                onResolve={resolveApproval}
                resolving={approving}
                error={approvalError}
                onDismiss={() => {
                  setApproval(null);
                  setApprovalError(null);
                }}
              />
            )}

            {attach && attach.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attach.map((p, i) => (
                  <div key={i} className="relative">
                    <img
                      src={`data:${p.mediaType ?? "image/png"};base64,${p.dataBase64}`}
                      alt="attachment"
                      className="h-16 rounded-xl object-cover ring-1 ring-zinc-200"
                    />
                    <button
                      onClick={() => setAttach((a) => (a ? a.filter((_, j) => j !== i) : a))}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-white shadow"
                      title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pill Container */}
            <div className="flex items-end gap-1.5 sm:gap-2 rounded-3xl border border-zinc-300 bg-white p-2 shadow-xs transition-all focus-within:border-zinc-400 focus-within:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  pickAttachment(e.target.files);
                  e.target.value = "";
                }}
              />
              {/* Attach Images */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Attach images"
                aria-label="Attach images"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 transition"
              >
                <ImagePlus className="h-4 w-4" />
              </button>

              {/* AI Modes & Effort Plus (+) Action Menu */}
              <ModeAndEffortMenu
                mode={selectedMode}
                onModeChange={handleModeChange}
                effort={selectedEffort}
                onEffortChange={handleEffortChange}
                disabled={streaming}
              />

              <textarea
                ref={textareaRef}
                value={draft}
                onChange={handleDraftChange}
                aria-label="Message prompt composer"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) {
                      send({ content: sendContent(), model: model || undefined });
                      resetTextareaHeight();
                    }
                  }
                }}
                rows={1}
                placeholder="Ask anything or message your vault… (Ctrl+K)"
                className="max-h-36 min-h-[38px] w-full resize-none bg-transparent px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
              />

              {/* Iconic ChatGPT / Gemini Send Button (Round black with ArrowUp) */}
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  title="Stop generating"
                  aria-label="Stop generating"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white shadow-md transition hover:bg-zinc-800 active:scale-95 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  <Square className="h-4 w-4 fill-white dark:fill-zinc-900" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (canSend) {
                      send({ content: sendContent(), model: model || undefined });
                      resetTextareaHeight();
                    }
                  }}
                  disabled={!canSend}
                  title="Send message"
                  aria-label="Send message"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 shadow-md ${
                    canSend
                      ? "bg-zinc-900 text-white hover:bg-zinc-800 active:scale-95 cursor-pointer dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                      : "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed"
                  }`}
                >
                  <ArrowUp className="h-5 w-5 stroke-[2.5]" />
                </button>
              )}
            </div>
            <div className="mt-1 text-center text-[10px] text-zinc-400">
              AI operations on files and database are protected by local encryption and approvals.
            </div>
          </div>
        </div>
        {/* Citation cables overlay, Artifact drawer & Memory drawer */}
        <CitationCables citations={citations} containerRef={containerRef} />
        <ArtifactDrawer
          isOpen={artifactOpen}
          onClose={() => setArtifactOpen(false)}
          artifact={artifact}
        />
        <MemoryDrawer
          isOpen={memoryDrawerOpen}
          onClose={() => setMemoryDrawerOpen(false)}
          currentSessionId={active ?? undefined}
          initialNewMemoryPoint={memoryDrawerSeedPoint}
        />

        {/* Delete Confirmation Modal (CHAT-39) */}
        {confirmDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-2xs p-4 animate-in fade-in-50">
            <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Delete Conversation?
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                    This will permanently delete this conversation and its entire history.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSession(confirmDeleteId)}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 shadow-2xs transition cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {morningFeedOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
            <div className="w-full max-w-2xl h-[80vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  Autonomous Daemon Governance & Morning Feed
                </span>
                <button
                  onClick={() => setMorningFeedOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-bold px-2 py-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <MorningApprovalsFeed />
              </div>
            </div>
          </div>
        )}

        {widgetRegistryOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
            <div className="w-full max-w-2xl h-[75vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  Safe Extensions & Widget Sandbox
                </span>
                <button
                  onClick={() => setWidgetRegistryOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-bold px-2 py-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-hidden p-3">
                <WidgetRegistry />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

