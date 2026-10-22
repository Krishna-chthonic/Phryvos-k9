/**
 * Provider-agnostic LLM types — the lingua franca between chat, the adapters,
 * and (P4) the agent loop. OpenAI function-calling JSON is the tool schema;
 * each adapter translates to its wire format.
 */

export type Role = "system" | "user" | "assistant" | "tool";

export interface UnifiedPart {
  type: "text" | "image";
  /** text parts */
  text?: string;
  /** image parts: base64 payload + media type (encrypted at rest as JSON) */
  dataBase64?: string;
  mediaType?: string;
}

export interface UnifiedMessage {
  role: Role;
  /** string, or parts (user: text + images). tool role must be a string. */
  content: string | UnifiedPart[];
  /** assistant messages carrying tool calls */
  toolCalls?: ToolCall[];
  /** tool messages reference the call they answer */
  toolCallId?: string;
  /** tool messages carry the tool function name (display) */
  name?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** filled in by the loop after execution */
  result?: string;
  approved?: boolean;
}

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface TurnUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface TurnTelemetry {
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  model: string;
  provider: string;
  finishReason: string;
}

export interface TurnResult {
  text: string;
  toolCalls: ToolCall[];
  finish: "stop" | "tool_calls" | "length" | "error";
  usage?: TurnUsage;
}

export type DeltaFn = (textDelta: string) => void;

export interface TurnOptions {
  reasoningEffort?: "low" | "medium" | "high";
  thinkingBudget?: number;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/** One provider connection, bound to a model. */
export interface LlmClient {
  /**
   * Run one turn. When onDelta is given the adapter streams text deltas to it
   * (tool-call turns emit nothing — only the final result matters).
   */
  createTurn(
    messages: UnifiedMessage[],
    tools: ToolSpec[] | undefined,
    model: string,
    onDelta?: DeltaFn,
    options?: TurnOptions,
  ): Promise<TurnResult>;

  /** Cheap connectivity check with the given (or default) model. */
  testConnection(model?: string): Promise<{ ok: boolean; detail?: string }>;
}
