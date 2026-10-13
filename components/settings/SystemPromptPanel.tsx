"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { settingsApi } from "@/lib/chat-client";

/**
 * The global system prompt — prepended to every chat. Applies to all
 * sessions and providers; the agent loop follows it too.
 */
export function SystemPromptPanel() {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    settingsApi
      .getSystemPrompt()
      .then((r) => setText(r.systemPrompt ?? ""))
      .catch(() => setErr("Failed to load the system prompt."))
      .finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      await settingsApi.setSystemPrompt(text);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-medium text-zinc-800">System prompt</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Instructions prepended to every chat, for every provider. Leave empty to
          use the default behavior.
        </p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!loaded}
        rows={4}
        placeholder="e.g. Be concise. When updating tasks, always confirm dates in YYYY-MM-DD. Prefer my existing projects over creating new ones."
        className="w-full resize-y rounded-lg border border-zinc-300 bg-white p-3 text-xs leading-5 outline-none placeholder:text-zinc-400 focus:border-zinc-500"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || !loaded}
          className="flex h-7 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-700 disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" />
          {busy ? "Saving…" : saved ? "Saved ✓" : "Save prompt"}
        </button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </section>
  );
}
