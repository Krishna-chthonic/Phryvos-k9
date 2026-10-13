import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmClient,
  ToolCall,
  ToolSpec,
  TurnResult,
  UnifiedMessage,
  UnifiedPart,
} from "../types";
import type { ProviderConnection } from "./openai-compatible";

/**
 * Anthropic Messages API adapter (Claude presets). Quirks handled:
 * - system prompt is a top-level param, not a message
 * - max_tokens is mandatory
 * - consecutive same-role messages are merged (wire format alternates)
 * - tool results ride on user messages as JSON-stringified tool_result blocks
 */

type AMsg = Anthropic.Messages.MessageParam;
type ABlock = Anthropic.Messages.ContentBlockParam;

function textOf(content: string | UnifiedPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

function userBlocks(m: UnifiedMessage): ABlock[] {
  if (typeof m.content === "string")
    return m.content ? ([{ type: "text", text: m.content }] as ABlock[]) : [];
  const blocks: ABlock[] = [];
  for (const p of m.content) {
    if (p.type === "text" && p.text) blocks.push({ type: "text", text: p.text });
    else if (p.type === "image" && p.dataBase64)
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: (p.mediaType ?? "image/png") as Anthropic.Messages.Base64ImageSource["media_type"],
          data: p.dataBase64,
        },
      });
  }
  return blocks;
}

function mapMessages(msgs: UnifiedMessage[]): { system: string; messages: AMsg[] } {
  let system = "";
  const out: AMsg[] = [];
  for (const m of msgs) {
    if (m.role === "system") {
      system += (system ? "\n\n" : "") + textOf(m.content);
      continue;
    }
    if (m.role === "user") {
      const blocks = userBlocks(m);
      if (!blocks.length) continue;
      const last = out[out.length - 1];
      if (last?.role === "user") {
        const prev = Array.isArray(last.content) ? last.content : [];
        out.push({ role: "user", content: [...prev, ...blocks] });
      } else {
        out.push({ role: "user", content: blocks });
      }
    } else if (m.role === "assistant") {
      const blocks: ABlock[] = [];
      const text = textOf(m.content);
      if (text) blocks.push({ type: "text", text });
      for (const tc of m.toolCalls ?? [])
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: (tc.args ?? {}) as Record<string, unknown>,
        });
      if (blocks.length) out.push({ role: "assistant", content: blocks });
    } else {
      // tool result → user message, JSON-string content (Anthropic quirk)
      const result: ABlock[] = [
        {
          type: "tool_result",
          tool_use_id: m.toolCallId ?? "",
          content: JSON.stringify(m.content),
        },
      ];
      const last = out[out.length - 1];
      if (last?.role === "user") {
        const prev = Array.isArray(last.content) ? last.content : [];
        out.push({ role: "user", content: [...prev, ...result] });
      } else {
        out.push({ role: "user", content: result });
      }
    }
  }
  return { system, messages: out };
}

export function createAnthropicClient(conn: ProviderConnection): LlmClient {
  const client = new Anthropic({
    baseURL: conn.baseUrl,
    apiKey: conn.apiKey || undefined,
  });

  const mapTools = (tools?: ToolSpec[]) =>
    tools?.length
      ? tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        }))
      : undefined;

  async function create(
    params: Record<string, unknown>,
    timeoutMs = 120_000,
  ): Promise<Anthropic.Message> {
    return client.messages.create(params as never, { timeout: timeoutMs });
  }

  return {
    async createTurn(messages, tools, model, onDelta): Promise<TurnResult> {
      const { system, messages: amsgs } = mapMessages(messages);
      const params = {
        model,
        max_tokens: 8192,
        system: system || undefined,
        messages: amsgs,
        tools: mapTools(tools),
        tool_choice: tools?.length ? ({ type: "auto" } as const) : undefined,
      };

      if (!onDelta) {
        const res = await create(params);
        let text = "";
        const tcs: ToolCall[] = [];
        for (const b of res.content) {
          if (b.type === "text") text += b.text;
          else if (b.type === "tool_use")
            tcs.push({
              id: b.id,
              name: b.name,
              args: (b.input as Record<string, unknown>) ?? {},
            });
        }
        return {
          text,
          toolCalls: tcs,
          finish: res.stop_reason === "tool_use" ? "tool_calls" : "stop",
          usage: {
            promptTokens: res.usage?.input_tokens,
            completionTokens: res.usage?.output_tokens,
          },
        };
      }

      const stream = client.messages.stream(params as never, { timeout: 180_000 });
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        )
          onDelta(event.delta.text);
      }
      const res = await stream.finalMessage();
      let text = "";
      const tcs: ToolCall[] = [];
      for (const b of res.content) {
        if (b.type === "text") text += b.text;
        else if (b.type === "tool_use")
          tcs.push({ id: b.id, name: b.name, args: (b.input as Record<string, unknown>) ?? {} });
      }
      return {
        text,
        toolCalls: tcs,
        finish: res.stop_reason === "tool_use" ? "tool_calls" : "stop",
        usage: {
          promptTokens: res.usage?.input_tokens,
          completionTokens: res.usage?.output_tokens,
        },
      };
    },

    async testConnection(model) {
      const m = model ?? conn.models[0] ?? "claude-sonnet-4-5";
      try {
        await create(
          {
            model: m,
            max_tokens: 8,
            messages: [{ role: "user", content: "Reply with: ok" }],
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
