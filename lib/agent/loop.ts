import type Database from "better-sqlite3";
import type { LlmClient, UnifiedMessage, ToolCall, TurnOptions } from "@/lib/ai/types";
import { ensureAgentTools } from "./tools";
import { runTool, isDestructive, toolSpecs } from "./registry";
import {
  MAX_AGENT_STEPS,
  TOOL_TIMEOUT_MS,
  PROVIDER_TIMEOUT_MS,
  withTimeout,
  truncateResult,
  requestApproval,
  type ApprovalOutcome,
} from "./guardrails";

/**
 * The provider-agnostic agent loop: run a turn, execute tool calls
 * (approval-gated when destructive, timed + truncated), feed results back,
 * repeat until the model stops calling tools (or the step cap is hit).
 *
 * Persistence is injected: the route wires appendAssistant/appendTool to
 * chat-service.appendMessage so the SSE request stays the single writer.
 * Provider errors propagate to the route, which emits the SSE `error`.
 */

export interface LoopDeps {
  db: Database.Database;
  key: Buffer;
  client: LlmClient;
  model: string;
  /** context after the user's new message is already appended (route persists it) */
  initialMessages: UnifiedMessage[];
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  /** fired after each tool execution with its result */
  onStep: (s: {
    step: number;
    toolCallId: string;
    tool: string;
    args: Record<string, unknown>;
    result: string;
    /** undefined ⇒ ran without gating; otherwise the approval outcome */
    approval?: ApprovalOutcome["decision"];
  }) => void;
  /** fired when a destructive tool needs the user's yes/no (blocks until answered) */
  onApprovalRequest: (a: {
    approvalId: string;
    tool: string;
    args: Record<string, unknown>;
    description: string;
  }) => void;
  appendAssistant: (text: string, toolCalls: ToolCall[]) => void;
  appendTool: (toolCallId: string, name: string, content: string) => void;
  /** Maximum tool steps allowed before forcing a conclusion */
  maxSteps?: number;
  /** Provider timeout in milliseconds */
  providerTimeoutMs?: number;
  /** If true, destructive tools are auto-approved without user prompt (e.g. autonomous Research mode) */
  autoApproveTools?: boolean;
  /** Provider turn parameters (reasoning_effort, thinkingBudget, temperature, etc.) */
  turnOptions?: TurnOptions;
}

export interface AgentResult {
  text: string;
  finish: "stop" | "tool_calls" | "length" | "error" | "capped";
  toolSteps: number;
}

function summarizeToolArgs(tool: string, args: Record<string, unknown>): string {
  const a = args ?? {};
  if (tool === "web_search" && a.query) return `query: "${String(a.query)}"`;
  if (tool === "web_fetch" && a.url) return `url: "${String(a.url)}"`;
  if (tool === "read_pdf" && a.path) return `path: "${String(a.path)}"`;
  if (tool === "write_file" && a.path) return `file: "${String(a.path)}"`;
  if (tool === "calculate" && a.expression) return `expr: "${String(a.expression)}"`;
  return truncateResult(JSON.stringify(a), 60);
}

function describeToolCall(tool: string, args: Record<string, unknown>): string {
  const a = args ?? {};
  switch (tool) {
    case "write_file":
      return `Write file ${String(a.path)} (${String(a.content ?? "").length.toLocaleString()} chars)`;
    case "create_directory":
      return `Create directory ${String(a.path)}`;
    case "move_file":
      return `Move ${String(a.from)} → ${String(a.to)}`;
    case "delete_file":
      return `Trash ${String(a.path)}`;
    case "delete_project":
      return `Delete project #${String(a.id)} (its tasks and time entries too)`;
    case "extract_zip":
      return `Extract zip ${String(a.zipPath)} → ${String(a.destinationDir)}`;
    case "delete_event":
      return `Delete event #${String(a.id)}`;
    default:
      return `${tool}(${truncateResult(JSON.stringify(a), 200)})`;
  }
}

export async function runAgentTurn(deps: LoopDeps): Promise<AgentResult> {
  ensureAgentTools();
  const ctx = { db: deps.db, key: deps.key };
  const { client, model, signal } = deps;
  const maxSteps = deps.maxSteps ?? MAX_AGENT_STEPS;
  const providerTimeout = deps.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS;
  const specs = toolSpecs();
  const messages: UnifiedMessage[] = [...deps.initialMessages];

  let accumulatedThought = "";
  let inThoughtBlock = false;
  const allExecutedTools: ToolCall[] = [];
  let toolSteps = 0;
  let capped = false;

  const emitThoughtDelta = (chunk: string) => {
    if (!inThoughtBlock) {
      inThoughtBlock = true;
      accumulatedThought += "<think>\n";
      deps.onDelta("<think>\n");
    }
    accumulatedThought += chunk;
    deps.onDelta(chunk);
  };

  const closeThoughtBlock = () => {
    if (inThoughtBlock) {
      inThoughtBlock = false;
      accumulatedThought += "\n</think>\n\n";
      deps.onDelta("\n</think>\n\n");
    }
  };

  while (true) {
    if (signal?.aborted) break;

    let turnText = "";

    const turn = await withTimeout(
      client.createTurn(
        messages,
        specs,
        model,
        (d) => {
          turnText += d;
          if (inThoughtBlock) {
            accumulatedThought += d;
            deps.onDelta(d);
          } else {
            deps.onDelta(d);
          }
        },
        deps.turnOptions,
      ),
      providerTimeout,
      "provider",
    );

    // If turn called tools, whatever text was output is pre-tool deliberation
    if (turn.toolCalls.length > 0) {
      allExecutedTools.push(...turn.toolCalls);
      if (!inThoughtBlock && turnText && !turnText.includes("<think>")) {
        inThoughtBlock = true;
        accumulatedThought += `<think>\n${turnText}\n`;
      }
      messages.push({ role: "assistant", content: turn.text, toolCalls: turn.toolCalls });
    } else {
      // Final turn: conclusion reached!
      closeThoughtBlock();
      const finalText = (accumulatedThought ? accumulatedThought : "") + (turn.text || turnText);
      deps.appendAssistant(finalText, allExecutedTools);
      return { text: finalText, finish: turn.finish === "tool_calls" ? "stop" : turn.finish, toolSteps };
    }

    // Step cap: after maxSteps tool rounds, force a plain answer.
    if (toolSteps >= maxSteps) {
      capped = true;
      closeThoughtBlock();
      messages.push({
        role: "system",
        content: `You have used all ${maxSteps} tool steps. Answer the user now using only the information you already have; do not call any more tools.`,
      });
      const final = await withTimeout(
        client.createTurn(messages, undefined, model, deps.onDelta, deps.turnOptions),
        providerTimeout,
        "provider",
      );
      const finalText = (accumulatedThought ? accumulatedThought : "") + final.text;
      deps.appendAssistant(finalText, allExecutedTools);
      return { text: finalText, finish: "capped", toolSteps };
    }

    for (const tc of turn.toolCalls) {
      if (signal?.aborted) {
        messages.push({
          role: "tool",
          content: "Stopped by the user.",
          toolCallId: tc.id,
          name: tc.name,
        });
        emitThoughtDelta(`\n> ⚠ Action cancelled by user\n`);
        deps.onStep({
          step: ++toolSteps,
          toolCallId: tc.id,
          tool: tc.name,
          args: tc.args,
          result: "Stopped by the user.",
        });
        continue;
      }

      emitThoughtDelta(`\n> 🔍 Action: ${tc.name} (${summarizeToolArgs(tc.name, tc.args)})\n`);

      let approval: ApprovalOutcome | undefined;
      let blocked = false;
      if (isDestructive(tc.name)) {
        if (deps.autoApproveTools) {
          approval = {
            decision: "allowed",
            detail: "Auto-approved in autonomous Research Mode.",
          };
          blocked = false;
        } else {
          const description = describeToolCall(tc.name, tc.args);
          const pending = requestApproval({ tool: tc.name, args: tc.args, description, signal });
          deps.onApprovalRequest({
            approvalId: pending.id,
            tool: tc.name,
            args: tc.args,
            description,
          });
          approval = await pending.promise;
          blocked = approval.decision !== "allowed";
        }
      }

      let result: string;
      if (blocked) {
        result = approval!.detail;
        emitThoughtDelta(`> ❌ Action blocked: ${result}\n`);
      } else {
        try {
          result = await withTimeout(
            Promise.resolve(runTool(tc.name, tc.args, ctx)),
            TOOL_TIMEOUT_MS,
            `tool ${tc.name}`,
          );
          emitThoughtDelta(`> ✔ Completed: ${tc.name}\n`);
        } catch (e) {
          result = `ERROR: ${tc.name} failed: ${e instanceof Error ? e.message : String(e)}`;
          emitThoughtDelta(`> ❌ Error: ${tc.name} failed\n`);
        }
        result = truncateResult(result);
      }

      toolSteps++;
      messages.push({ role: "tool", content: result, toolCallId: tc.id, name: tc.name });
      deps.onStep({
        step: toolSteps,
        toolCallId: tc.id,
        tool: tc.name,
        args: tc.args,
        result,
        approval: approval?.decision,
      });
    }
  }

  closeThoughtBlock();
  const finalText = (accumulatedThought ? accumulatedThought : "") + "(stopped)";
  deps.appendAssistant(finalText, allExecutedTools);
  return { text: finalText, finish: capped ? "capped" : "stop", toolSteps };
}
