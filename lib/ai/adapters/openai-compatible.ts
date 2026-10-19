import OpenAI from "openai";
import type {
  LlmClient,
  ToolCall,
  ToolSpec,
  TurnResult,
  UnifiedMessage,
  UnifiedPart,
} from "../types";

/**
 * OpenAI-compatible adapter — one client for OpenAI, OpenRouter, Ollama,
 * LM Studio, vLLM, … (anything speaking the /chat/completions wire format).
 * Keys are decrypted by the caller and only ever live in the request.
 */

export interface ProviderConnection {
  kind: "openai" | "anthropic";
  baseUrl: string;
  apiKey: string;
  models: string[];
}

type OaiMsg = OpenAI.Chat.ChatCompletionMessageParam;

function textOf(content: string | UnifiedPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

function toOaiMsgs(msgs: UnifiedMessage[]): OaiMsg[] {
  const out: OaiMsg[] = [];
  for (const m of msgs) {
    if (m.role === "system") {
      out.push({ role: "system", content: textOf(m.content) });
    } else if (m.role === "user") {
      const parts: Array<
        OpenAI.Chat.ChatCompletionContentPartText | OpenAI.Chat.ChatCompletionContentPartImage
      > = [];
      if (typeof m.content === "string") {
        if (m.content) parts.push({ type: "text", text: m.content });
      } else {
        for (const p of m.content) {
          if (p.type === "text" && p.text) parts.push({ type: "text", text: p.text });
          else if (p.type === "image" && p.dataBase64)
            parts.push({
              type: "image_url",
              image_url: {
                url: `data:${p.mediaType ?? "image/png"};base64,${p.dataBase64}`,
              },
            });
        }
      }
      out.push({ role: "user", content: parts.length ? parts : "" });
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: textOf(m.content) || null,
        tool_calls: m.toolCalls?.length
          ? m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.args ?? {}),
              },
            }))
          : undefined,
      });
    } else {
      // tool result
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId ?? "",
        content: textOf(m.content),
      });
    }
  }
  return out;
}

function parseToolArgs(s: string | undefined): Record<string, unknown> {
  if (!s || !s.trim()) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : { value: v };
  } catch {
    return { raw: s };
  }
}

export function createOpenAiCompatibleClient(conn: ProviderConnection): LlmClient {
  const client = new OpenAI({
    baseURL: conn.baseUrl,
    apiKey: conn.apiKey || "not-required",
  });

  const mapTools = (tools?: ToolSpec[]) =>
    tools?.length
      ? tools.map((t) => ({
          type: "function" as const,
          function: {
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          },
        }))
      : undefined;

  async function create(params: Record<string, unknown>, timeoutMs = 120_000) {
    return client.chat.completions.create(params as never, { timeout: timeoutMs });
  }

  return {
    async createTurn(messages, tools, model, onDelta, options): Promise<TurnResult> {
      const base: Record<string, unknown> = {
        model,
        messages: toOaiMsgs(messages),
        tools: mapTools(tools),
        tool_choice: tools?.length ? ("auto" as const) : undefined,
      };

      if (options?.reasoningEffort) {
        base.reasoning_effort = options.reasoningEffort;
      }
      if (options?.thinkingBudget && options.thinkingBudget > 0) {
        base.thinking = { type: "enabled", budget_tokens: options.thinkingBudget };
      }
      if (typeof options?.temperature === "number") {
        base.temperature = options.temperature;
      }
      if (typeof options?.maxTokens === "number") {
        base.max_tokens = options.maxTokens;
      } else if (options?.thinkingBudget) {
        base.max_tokens = Math.max(16384, options.thinkingBudget + 4096);
      }
      const timeoutMs = options?.timeoutMs ?? 180_000;

      if (!onDelta) {
        const res = await create({ ...base, stream: false }, timeoutMs);
        const choice = res.choices[0];
        const msg = choice?.message;
        const reasoning =
          (msg as { reasoning_content?: string; reasoning?: string })?.reasoning_content ??
          (msg as { reasoning_content?: string; reasoning?: string })?.reasoning;
        let fullText = msg?.content ?? "";
        if (reasoning && !fullText.includes("<think>")) {
          fullText = `<think>\n${reasoning}\n</think>\n\n${fullText}`;
        }
        const tcs: ToolCall[] = (msg?.tool_calls ?? []).map((tc, i) => {
          const fn = tc.type === "function" ? tc.function : undefined;
          return {
            id: tc.id || `call_${i}`,
            name: fn?.name ?? "",
            args: parseToolArgs(fn?.arguments),
          };
        });
        return {
          text: fullText,
          toolCalls: tcs,
          finish: choice?.finish_reason === "tool_calls" ? "tool_calls" : "stop",
          usage: res.usage
            ? {
                promptTokens: res.usage.prompt_tokens,
                completionTokens: res.usage.completion_tokens,
              }
            : undefined,
        };
      }

      // Streaming: text deltas out, tool-call fragments accumulated.
      // `create()` resolves to the non-streaming overload (params are `never`-cast),
      // so cast the awaited value to its real streaming shape.
      const stream = await create({ ...base, stream: true }, timeoutMs);
      const chunks = stream as unknown as AsyncIterable<{
        choices?: Array<{
          delta?: {
            content?: string;
            reasoning_content?: string;
            reasoning?: string;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              type?: "function" | "custom";
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      }>;
      let text = "";
      let inThinking = false;
      const calls = new Map<number, { id: string; name: string; args: string }>();
      for await (const chunk of chunks) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        const reasoning = delta.reasoning_content ?? delta.reasoning;
        if (reasoning) {
          if (!inThinking) {
            inThinking = true;
            text += "<think>\n";
            onDelta("<think>\n");
          }
          text += reasoning;
          onDelta(reasoning);
        }

        if (delta.content) {
          if (inThinking && !reasoning) {
            inThinking = false;
            text += "\n</think>\n\n";
            onDelta("\n</think>\n\n");
          }
          text += delta.content;
          onDelta(delta.content);
        }

        for (const tc of delta.tool_calls ?? []) {
          const slot = calls.get(tc.index ?? 0) ?? {
            id: "",
            name: "",
            args: "",
          };
          if (tc.id) slot.id = tc.id;
          if (tc.function?.name) slot.name += tc.function.name;
          if (tc.function?.arguments) slot.args += tc.function.arguments;
          calls.set(tc.index ?? 0, slot);
        }
      }
      if (inThinking) {
        inThinking = false;
        text += "\n</think>\n\n";
        onDelta("\n</think>\n\n");
      }
      const toolCalls: ToolCall[] = [...calls.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, c]) => ({
          id: c.id || `call_${Math.random().toString(36).slice(2, 10)}`,
          name: c.name,
          args: parseToolArgs(c.args),
        }));
      return {
        text,
        toolCalls,
        finish: toolCalls.length ? "tool_calls" : "stop",
      };
    },

    async testConnection(model) {
      const m = model ?? conn.models[0] ?? "gpt-4o-mini";
      try {
        await create(
          {
            model: m,
            messages: [{ role: "user", content: "Reply with: ok" }],
            max_tokens: 8,
            stream: false,
          },
          20_000,
        );
        return { ok: true, detail: `Connected to ${m}` };
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : "Connection failed" };
      }
    },
  };
}
