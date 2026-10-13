/**
 * Main chat interface for phryvos-k9 with KaTeX math, session compaction, and dark mode.
 *
 * Importers/callers: app/(app)/chat/page.tsx
 * Affected API: /api/chat/sessions, /api/chat/sessions/:id/compact, /api/chat/sessions/:id/messages
 * Data schemas if any: ChatSessionMeta, ChatMessageDto
 * User instruction verbatim: "1. i want dual theme dark and light , 2. agar isme compaction ka system hota toh thik rahta like koi session jyada lamba ho gaya toh dikkat ho sakti hai , 3. ek memmory system bhi hona chahiye ai ke liye jisme vo points bana ke chijo ko permanentlt yaad rakhe jinko users khud se kahe ki ye chij yaad rakhna ya permanently save kar lo , 4. em aur badi dikkat like me kai mathematics quetions yaha karunga ya solutioms ai se lunga toh solution jo hai vo alag form me aa raje hai ( latex ) toh numerical values samajh me aye esa simplify chahiye , 5. aur ai ke paas kuch skills plugins bhi hone chahiye jo ki important hai like web search, web fetch, etc."
 */
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  Brain,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Folder,
  Globe,
  GraduationCap,
  ImagePlus,
  ListChecks,
  Loader2,
  MessageSquare,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Square,
  Target,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  approvalsApi,
  chatApi,
  providersApi,
  type ChatMessageDto,
  type ChatSessionMeta,
  type ProviderMeta,
} from "@/lib/chat-client";
import type { UnifiedPart } from "@/lib/ai/types";

/* ---------------------------------------------------------------- helpers */

function textOf(content: string | UnifiedPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

function imagesOf(
  content: string | UnifiedPart[],
): Array<{ b64: string; mime: string }> {
  if (typeof content === "string") return [];
  return content
    .filter((p) => p.type === "image" && p.dataBase64)
    .map((p) => ({ b64: p.dataBase64!, mime: p.mediaType ?? "image/png" }));
}

function when(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

/** Live tool execution reported by the SSE `step` event. */
interface StepEvt {
  step: number;
  toolCallId: string;
  tool: string;
  args: Record<string, unknown>;
  result: string;
  approval?: string;
}

/** Destructive tool awaiting the user — the SSE `approval` event. */
interface ApprovalReq {
  approvalId: string;
  tool: string;
  args: Record<string, unknown>;
  description: string;
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

/* ---------------------------------------------------------------- markdown */

function Markdown({ children }: { children: string }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyCode = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCode(codeText);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-100 space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre: ({ children }) => {
            return (
              <div className="relative group my-3 overflow-hidden rounded-xl bg-zinc-900 text-zinc-100 shadow-md border border-zinc-800">
                <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800/80 border-b border-zinc-700/50 text-[11px] text-zinc-400">
                  <span>code</span>
                  <button
                    onClick={() => {
                      const codeEl = (children as React.ReactElement<{ children?: unknown }>)?.props?.children;
                      if (typeof codeEl === "string") handleCopyCode(codeEl);
                    }}
                    className="flex items-center gap-1 hover:text-zinc-200 transition"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="overflow-x-auto p-3 text-xs font-mono leading-normal">
                  {children}
                </pre>
              </div>
            );
          },
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) return <code>{children}</code>;
            return (
              <code className="rounded-md bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 text-xs font-mono text-zinc-800 border border-zinc-200/60 dark:border-zinc-700">
                {children}
              </code>
            );
          },
          p: ({ children }) => <p className="leading-relaxed mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-3 mb-1.5">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-2.5 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mt-2 mb-1">{children}</h3>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function toolBadge(name: string): { label: string; icon: React.ComponentType<{ className?: string }> } {
  switch (name) {
    case "save_memory":
      return { label: "Saved to Memory", icon: Brain };
    case "list_memories":
      return { label: "Recalled Memories", icon: Brain };
    case "delete_memory":
      return { label: "Forgot Memory", icon: Brain };
    case "calculate":
      return { label: "Calculated", icon: Calculator };
    case "web_search":
      return { label: "Web Search", icon: Search };
    case "web_fetch":
      return { label: "Fetched Webpage", icon: Globe };
    default:
      return { label: name, icon: Wrench };
  }
}

/* ---------------------------------------------------------------- message row */

function MessageRow({
  msg,
  streaming,
  onEdit,
  toolName,
}: {
  msg: ChatMessageDto;
  streaming?: boolean;
  onEdit: (msg: ChatMessageDto) => void;
  toolName?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (msg.role === "tool") {
    const badge = toolBadge(toolName ?? "tool result");
    const Icon = badge.icon;
    return (
      <div className="mx-auto my-1.5 w-fit rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-600 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
        <span className="inline-flex items-center gap-1 font-semibold text-zinc-700 dark:text-zinc-200">
          <Icon className="h-3 w-3 text-indigo-500" />
          {badge.label}
        </span>{" "}
        <span className="text-zinc-400">·</span> {textOf(msg.content).slice(0, 180)}
      </div>
    );
  }

  const user = msg.role === "user";
  const body = textOf(msg.content);
  const imgs = imagesOf(msg.content);

  const copyText = () => {
    navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`group flex w-full ${
        user ? "justify-end" : "justify-start"
      } px-3 md:px-4 py-2`}
    >
      <div
        className={`relative max-w-[85%] md:max-w-[76%] rounded-2xl px-4 py-3 shadow-xs ${
          user
            ? "bg-zinc-900 text-white rounded-tr-xs dark:bg-zinc-100 dark:text-zinc-900"
            : "bg-white text-zinc-800 border border-zinc-200/80 rounded-tl-xs shadow-xs dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
        }`}
      >
        {/* Images */}
        {imgs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {imgs.map((im, i) => (
              <img
                key={i}
                src={`data:${im.mime};base64,${im.b64}`}
                alt="attachment"
                className="h-32 rounded-lg object-cover ring-1 ring-zinc-200"
              />
            ))}
          </div>
        )}

        {/* Content */}
        {user ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{body}</div>
        ) : streaming ? (
          <div className="text-sm">
            {body ? (
              <Markdown>{body}</Markdown>
            ) : (
              <div className="flex items-center gap-2 py-1 text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin text-zinc-600 dark:text-zinc-300" />
                <span className="text-xs font-medium">Thinking…</span>
              </div>
            )}
          </div>
        ) : (
          <Markdown>{body}</Markdown>
        )}

        {/* Tool calls */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-2">
            {(msg.toolCalls as Array<{ name: string }>).map((tc, i) => {
              const badge = toolBadge(tc.name);
              const Icon = badge.icon;
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                >
                  <Icon className="h-3 w-3 text-indigo-500 dark:text-indigo-400" />
                  {badge.label}
                </span>
              );
            })}
          </div>
        )}

        {/* Action icons (copy & edit) */}
        <div
          className={`mt-1.5 flex items-center gap-2 text-xs transition-opacity ${
            user ? "justify-end text-zinc-400" : "text-zinc-400"
          }`}
        >
          {!streaming && body && (
            <button
              onClick={copyText}
              className="flex items-center gap-1 hover:text-zinc-600"
              title="Copy message"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-500" />
                  <span className="text-[10px] text-emerald-600">Copied</span>
                </>
              ) : (
                <Copy className="h-3 w-3 opacity-60 hover:opacity-100" />
              )}
            </button>
          )}

          {user && !streaming && (
            <button
              onClick={() => onEdit(msg)}
              className="flex items-center gap-1 hover:text-zinc-200"
              title="Edit message"
            >
              <Pencil className="h-3 w-3 opacity-60 hover:opacity-100" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- badges */

function ToolStepBadge({ s }: { s: StepEvt }) {
  const summary =
    s.tool === "write_file"
      ? `→ ${String(s.args.path ?? "")}`
      : s.tool === "delete_file" || s.tool === "create_directory"
        ? `→ ${String(s.args.path ?? "")}`
        : s.tool === "search_files"
          ? `“${String(s.args.query ?? "")}”`
          : s.tool === "data_query"
            ? "SQL query"
            : JSON.stringify(s.args).slice(0, 80);
  const note =
    s.approval === "allowed"
      ? "approved"
      : s.approval && s.approval !== "allowed"
        ? s.approval.replace("_", "-")
        : null;
  return (
    <div className="mx-auto my-1 flex w-fit max-w-[85%] items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 shadow-2xs">
      <Wrench className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
      <span className="font-semibold text-zinc-800">{s.tool}</span>
      <span className="max-w-xs truncate text-zinc-500">{summary}</span>
      {note && (
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
            note === "approved"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-600"
          }`}
        >
          {note}
        </span>
      )}
      <span className="text-zinc-300">·</span>
      <span className="max-w-xs truncate text-zinc-400">{s.result.slice(0, 100)}</span>
    </div>
  );
}

function ApprovalDialog({
  approval,
  onResolve,
  resolving,
}: {
  approval: ApprovalReq;
  onResolve: (id: string, decision: "allow" | "deny") => void;
  resolving: boolean;
}) {
  return (
    <div className="mx-auto mb-3 w-full max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-amber-950">
            {approval.description}
          </div>
          <div className="mt-0.5 text-xs text-amber-700">
            The AI agent wants to execute a sensitive action. Auto-denies in 5 minutes if unapproved.
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => onResolve(approval.approvalId, "deny")}
            disabled={resolving}
            className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
          >
            Deny
          </button>
          <button
            onClick={() => onResolve(approval.approvalId, "allow")}
            disabled={resolving}
            className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-40 shadow-xs"
          >
            {resolving ? "…" : "Allow"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [compacting, setCompacting] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

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
      try {
        const { session, messages } = await chatApi.getSession(sid);
        setMessages(messages);
        setModel(session.model);
        setProviderId(session.providerId ?? "");
        setActive(sid);
        setMobileRailOpen(false);
        setSessions((prev) =>
          prev.map((s) => (s.id === sid ? { ...s, ...session } : s)),
        );
        loadSessions();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to open chat");
      }
    },
    [loadSessions],
  );

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
      const { session } = await chatApi.createSession({ model: m, providerId: pid });
      setSessions((s) => [session, ...s]);
      setActive(session.id);
      setMessages([]);
      setMobileRailOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create chat");
    } finally {
      setBusy(false);
    }
  }, [busy, streaming, providerId, model, providers]);

  const pickProvider = useCallback(
    async (id: number | "") => {
      setProviderId(id);
      const p = providers.find((x) => x.id === id);
      if (p && p.models.length) setModel(p.models[0]);
      if (active) {
        try {
          await chatApi.patchSession(active, {
            providerId: id === "" ? null : id,
            model: model || p?.models[0] || undefined,
          });
        } catch {
          /* session may not exist yet — applied on creation */
        }
      }
    },
    [active, providers, model],
  );

  const send = useCallback(
    async (body: {
      content?: string | UnifiedPart[];
      model?: string;
      regenerate?: boolean;
    }) => {
      if (streaming) return;
      setErr(null);
      setEditing(null);

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
          });
          setSessions((s) => [session, ...s]);
          setActive(session.id);
          targetSessionId = session.id;
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Failed to start chat session");
          return;
        }
      }

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStreaming(true);
      setStreamText("");
      setSteps([]);
      setApproval(null);

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
          setAttach(null);
        }
        await chatApi.sendMessage(
          targetSessionId,
          body,
          (ev, data) => {
            let d: Record<string, unknown>;
            try {
              d = JSON.parse(data || "{}");
            } catch {
              return;
            }
            if (ev === "delta") setStreamText((s) => s + (d.text as string ?? ""));
            else if (ev === "step")
              setSteps((s) => [...s, d as unknown as StepEvt].slice(-20));
            else if (ev === "approval") setApproval(d as unknown as ApprovalReq);
            else if (ev === "done") setApproval(null);
            else if (ev === "error") setErr(String(d.message ?? "Provider error"));
          },
          ctrl.signal,
        );
        // server persisted the final message — resync
        await loadMessages(targetSessionId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Request failed";
        setErr(
          msg.includes("503") || msg.includes("lock")
            ? "Vault locked — unlock to continue."
            : msg,
        );
      } finally {
        setStreaming(false);
        setStreamText("");
        setSteps([]);
        setApproval(null);
        setApproving(false);
        abortRef.current = null;
      }
    },
    [active, streaming, providerId, model, providers, loadMessages],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resolveApproval = useCallback(async (id: string, decision: "allow" | "deny") => {
    setApproving(true);
    try {
      await approvalsApi.resolve(id, decision);
      setApproval(null);
    } catch {
      setApproval(null);
    } finally {
      setApproving(false);
    }
  }, []);

  const startEdit = useCallback((msg: ChatMessageDto) => {
    setMessages((ms) => ms.filter((m) => m.id !== msg.id && !m.id.startsWith("local_")));
    setEditing({ id: msg.id, text: textOf(msg.content) });
  }, []);

  const saveEdit = useCallback(async () => {
    if (!active || !editing) return;
    setBusy(true);
    try {
      const { messages: fresh } = await chatApi.editMessage(active, editing.id, editing.text);
      setMessages(fresh);
      setEditing(null);
      loadSessions();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Edit failed");
    } finally {
      setBusy(false);
    }
  }, [active, editing, loadSessions]);

  const pickAttachment = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const parts: UnifiedPart[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
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

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [streamText, messages.length]);

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Mobile History Backdrop */}
      {mobileRailOpen && (
        <div
          onClick={() => setMobileRailOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Session Rail (Desktop Pinned & Mobile Slide-over Drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-zinc-200 bg-white transition-transform duration-300 md:static md:w-64 md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950 ${
          mobileRailOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
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
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
          {sessions.length === 0 && (
            <div className="p-4 text-center text-xs text-zinc-400">
              No conversations yet. Start one!
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => !streaming && loadMessages(s.id)}
              className={`group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all ${
                s.id === active
                  ? "bg-zinc-900 font-medium text-white shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              <MessageSquare
                className={`h-4 w-4 shrink-0 ${
                  s.id === active ? "text-white" : "text-zinc-400"
                }`}
              />
              <span className="min-w-0 flex-1 truncate text-xs">
                {s.title || "New chat"}
              </span>
              <span
                className={`shrink-0 text-[10px] ${
                  s.id === active ? "text-zinc-300" : "text-zinc-400"
                }`}
              >
                {when(s.updatedAt)}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  chatApi.deleteSession(s.id).then(() => {
                    setSessions((x) => x.filter((y) => y.id !== s.id));
                    if (s.id === active) {
                      setActive(null);
                      setMessages([]);
                    }
                  });
                }}
                className={`hidden h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-red-500 group-hover:flex ${
                  s.id === active ? "hover:text-red-300 text-zinc-300" : ""
                }`}
                title="Delete chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
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
        {/* Chat Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800 px-3 md:px-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileRailOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900 md:hidden"
              title="Chat History"
            >
              <PanelLeft className="h-4 w-4" />
              <span>Chats</span>
            </button>
            <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {activeSession ? activeSession.title || "New chat" : "AI Assistant"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {active && messages.length >= 2 && !streaming && (
              <button
                onClick={handleCompact}
                disabled={compacting}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
                title="Compact conversation history to save tokens and keep chat fast"
              >
                {compacting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                ) : (
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                )}
                <span className="hidden sm:inline">{compacting ? "Compacting…" : "Compact"}</span>
              </button>
            )}

            <select
              value={String(providerId)}
              onChange={(e) =>
                pickProvider(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="h-8 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none"
              title="Select Provider"
            >
              <option value="">No provider</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {modelOptions.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="h-8 max-w-[130px] md:max-w-[180px] rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none"
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
                placeholder="model id…"
                className="h-8 w-28 md:w-36 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 outline-none"
              />
            )}

            {!streaming && lastMsg?.role === "assistant" && (
              <button
                onClick={() => send({ regenerate: true })}
                className="flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                title="Regenerate last reply"
              >
                <RefreshCw className="h-3 w-3" />
                <span className="hidden sm:inline">Retry</span>
              </button>
            )}
          </div>
        </div>

        {err && (
          <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
            <span className="flex-1 font-medium">{err}</span>
            <button onClick={() => setErr(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Message Stream or ChatGPT / Gemini Hero Welcome */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-4 bg-white dark:bg-zinc-950">
          {!active || (messages.length === 0 && !streamText) ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-4 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-white shadow-lg ring-4 ring-zinc-100 dark:bg-zinc-800 dark:ring-zinc-800">
                <Sparkles className="h-7 w-7 text-emerald-400" />
              </div>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                What can I help with today?
              </h2>
              <p className="mt-1.5 text-xs md:text-sm text-zinc-500 dark:text-zinc-400 max-w-md">
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
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 group-hover:bg-zinc-900 group-hover:text-white dark:bg-zinc-800 dark:text-zinc-300 dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-900 transition">
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
            <div className="mx-auto max-w-3xl px-3 md:px-0">
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
                const name =
                  m.role === "tool" && m.toolCallId
                    ? (toolNames.get(m.toolCallId) ?? undefined)
                    : undefined;
                return (
                  <MessageRow key={m.id} msg={m} toolName={name} onEdit={startEdit} />
                );
              })}
              {streamText && (
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
                  streaming
                  onEdit={() => {}}
                />
              )}
              {steps.map((s) => (
                <ToolStepBadge key={s.toolCallId} s={s} />
              ))}
              {editing && (
                <EditBox
                  value={editing.text}
                  onChange={(v) => setEditing((e) => (e ? { ...e, text: v } : e))}
                  onSave={saveEdit}
                  onCancel={() => setEditing(null)}
                  busy={busy}
                />
              )}
            </div>
          )}
        </div>

        {/* Composer (ChatGPT/Gemini rounded pill style with ArrowUp mobile send button) */}
        <div className="shrink-0 border-t border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 px-3 py-3 md:px-4">
          <div className="mx-auto max-w-3xl">
            {approval && (
              <ApprovalDialog
                approval={approval}
                onResolve={resolveApproval}
                resolving={approving}
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
            <div className="flex items-end gap-2 rounded-3xl border border-zinc-300 bg-white p-2 shadow-xs transition-all focus-within:border-zinc-400 focus-within:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
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
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Attach images"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 transition"
              >
                <ImagePlus className="h-4 w-4" />
              </button>

              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) send({ content: sendContent(), model: model || undefined });
                  }
                }}
                rows={1}
                placeholder="Ask anything or message your vault…"
                className="max-h-36 min-h-[38px] w-full resize-none bg-transparent px-2 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
              />

              {/* Iconic ChatGPT / Gemini Send Button (Round black with ArrowUp) */}
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  title="Stop generating"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white shadow-md transition hover:bg-zinc-800 active:scale-95 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  <Square className="h-4 w-4 fill-white dark:fill-zinc-900" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    canSend && send({ content: sendContent(), model: model || undefined })
                  }
                  disabled={!canSend}
                  title="Send message"
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
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- edit box */

function EditBox({
  value,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="mx-auto my-2 w-full max-w-3xl rounded-2xl border border-zinc-300 bg-white p-3 shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full resize-none bg-transparent text-sm text-zinc-800 dark:text-zinc-100 outline-none"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={busy || !value.trim()}
          className="rounded-xl bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-40 shadow-xs dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Save & resend
        </button>
      </div>
    </div>
  );
}
