"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, KeyRound, Plus, Star, Trash2, X } from "lucide-react";
import { providersApi, type ProviderMeta } from "@/lib/chat-client";

interface Preset {
  label: string;
  kind: "openai" | "anthropic";
  baseUrl: string;
  models: string;
  defaultName: string;
}

const PRESETS: Preset[] = [
  {
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: "gpt-4o-mini, gpt-4o",
    defaultName: "OpenAI",
  },
  {
    label: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    models: "claude-sonnet-4-5",
    defaultName: "Anthropic",
  },
  {
    label: "Google",
    kind: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: "gemini-2.0-flash",
    defaultName: "Google",
  },
  {
    label: "Ollama",
    kind: "openai",
    baseUrl: "http://localhost:11434/v1",
    models: "llama3.1",
    defaultName: "Ollama",
  },
  {
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    models: "openrouter/auto",
    defaultName: "OpenRouter",
  },
];

export function ProvidersPanel() {
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"openai" | "anthropic">("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState("");
  const [asDefault, setAsDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [testState, setTestState] = useState<
    Record<number, { busy: boolean; ok: boolean | null; detail: string }>
  >({});

  const load = useCallback(async () => {
    try {
      const { providers } = await providersApi.list();
      setProviders(providers);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load providers");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const applyPreset = (p: Preset) => {
    setShowForm(true);
    setName(p.defaultName);
    setKind(p.kind);
    setBaseUrl(p.baseUrl);
    setModels(p.models);
    setApiKey("");
    setAsDefault(true);
  };

  const save = async () => {
    if (!name.trim() || !baseUrl.trim()) {
      setErr("Name and base URL are required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await providersApi.create({
        name: name.trim(),
        kind,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey || undefined,
        models: models
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        isDefault: asDefault,
      });
      setShowForm(false);
      setApiKey("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add provider");
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (id: number) => {
    try {
      await providersApi.patch(id, { isDefault: true });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to set default");
    }
  };

  const remove = async (id: number) => {
    try {
      await providersApi.remove(id);
      setProviders((ps) => ps.filter((p) => p.id !== id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to remove provider");
    }
  };

  const test = async (id: number) => {
    setTestState((s) => ({ ...s, [id]: { busy: true, ok: null, detail: "" } }));
    try {
      const r = await providersApi.test(id);
      setTestState((s) => ({
        ...s,
        [id]: { busy: false, ok: r.ok, detail: r.detail ?? "" },
      }));
    } catch {
      setTestState((s) => ({
        ...s,
        [id]: { busy: false, ok: false, detail: "Request failed" },
      }));
    }
  };

  const input =
    "h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs outline-none focus:border-zinc-500";

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-zinc-800">AI providers</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Link any OpenAI-compatible or Anthropic endpoint. Keys are encrypted in the
            vault; chats pick a provider and model per session.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-700"
        >
          <Plus className="h-3.5 w-3.5" />
          {showForm ? "Cancel" : "Add provider"}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap gap-1.5">
            <span className="mr-1 self-center text-[11px] text-zinc-400">Presets:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="rounded-full border border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-100"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] text-zinc-500">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My endpoint"
                className={input + " mt-1"}
              />
            </label>
            <label className="text-[11px] text-zinc-500">
              API protocol
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as "openai" | "anthropic")}
                className={input + " mt-1"}
              >
                <option value="openai">OpenAI-compatible (/chat/completions)</option>
                <option value="anthropic">Anthropic Messages API</option>
              </select>
            </label>
            <label className="col-span-2 text-[11px] text-zinc-500">
              Base URL
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className={input + " mt-1"}
              />
            </label>
            <label className="text-[11px] text-zinc-500">
              API key
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                className={input + " mt-1"}
              />
            </label>
            <label className="text-[11px] text-zinc-500">
              Models <span className="text-zinc-400">(comma separated, optional)</span>
              <input
                value={models}
                onChange={(e) => setModels(e.target.value)}
                placeholder="gpt-4o-mini, gpt-4o"
                className={input + " mt-1"}
              />
            </label>
            <label className="col-span-2 flex items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={asDefault}
                onChange={(e) => setAsDefault(e.target.checked)}
                className="h-3.5 w-3.5 accent-zinc-900"
              />
              Use as default provider
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between">
            {err ? (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <X className="h-3 w-3" /> {err}
              </span>
            ) : (
              <span />
            )}
            <button
              onClick={save}
              disabled={saving}
              className="flex h-7 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              <KeyRound className="h-3 w-3" />
              {saving ? "Saving…" : "Save provider"}
            </button>
          </div>
        </div>
      )}

      {providers.length === 0 && !showForm && (
        <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500">
          No providers yet. Pick a preset above or add your own endpoint — local servers
          like Ollama or a homelab LLM gateway work fine as OpenAI-compatible targets.
        </p>
      )}

      <ul className="space-y-2">
        {providers.map((p) => {
          const t = testState[p.id];
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5"
            >
              <button
                onClick={() => setDefault(p.id)}
                title={p.isDefault ? "Default provider" : "Make default"}
                className="shrink-0 text-zinc-400 hover:text-zinc-700"
              >
                <Star
                  className={`h-4 w-4 ${p.isDefault ? "fill-zinc-900 text-zinc-900" : ""}`}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm text-zinc-800">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500">
                    {p.kind}
                  </span>
                  {p.isDefault && (
                    <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] text-white">
                      default
                    </span>
                  )}
                  <span className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    {p.hasKey ? "key stored" : "no key"}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                  {p.baseUrl}
                  {p.models.length > 0 && (
                    <span className="text-zinc-400"> · {p.models.join(", ")}</span>
                  )}
                </div>
                {t?.detail && (
                  <div
                    className={`mt-1 text-[11px] ${t.ok ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {t.ok ? "✓" : "✗"} {t.detail}
                  </div>
                )}
              </div>
              <button
                onClick={() => test(p.id)}
                disabled={t?.busy}
                title="Test connection"
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 px-2 text-[11px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                {t?.busy ? "Testing…" : (
                  <>
                    <Check className="h-3 w-3" /> Test
                  </>
                )}
              </button>
              <button
                onClick={() => remove(p.id)}
                title="Delete provider"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
