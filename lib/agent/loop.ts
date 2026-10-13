import type Database from "better-sqlite3";
import type { LlmClient, UnifiedMessage, ToolCall } from "@/lib/ai/types";
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
}

export interface AgentResult {
  text: string;
  finish: "stop" | "tool_calls" | "length" | "error" | "capped";
  toolSteps: number;
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
    default:
      return `${tool}(${truncateResult(JSON.stringify(a), 200)})`;
  }
}

export async function runAgentTurn(deps: LoopDeps): Promise<AgentResult> {
  ensureAgentTools();
  const ctx = { db: deps.db, key: deps.key };
  const { client, model, signal } = deps;
  const specs = toolSpecs();
  const messages: UnifiedMessage[] = [...deps.initialMessages];

  let text = "";
  let toolSteps = 0;
  let capped = false;

  while (true) {
    if (signal?.aborted) break;

    // One provider turn. Text deltas stream to the client as they arrive.
    const turn = await withTimeout(
      client.createTurn(messages, specs, model, deps.onDelta),
      PROVIDER_TIMEOUT_MS,
      "provider",
    );

    text = turn.text || text;

    // No tools → final answer
    if (!turn.toolCalls.length) {
      deps.appendAssistant(text, []);
      return { text, finish: turn.finish === "tool_calls" ? "stop" : turn.finish, toolSteps };
    }

    // Persist + hand the tool calls to the model
    deps.appendAssistant(text, turn.toolCalls);
    messages.push({ role: "assistant", content: text, toolCalls: turn.toolCalls });

    // Step cap: after MAX_AGENT_STEPS tool rounds, force a plain answer.
    if (toolSteps >= MAX_AGENT_STEPS) {
      capped = true;
      messages.push({
        role: "system",
        content:
          "You have used all 12 tool steps. Answer the user now using only the information you already have; do not call any more tools.",
      });
      const final = await withTimeout(
        client.createTurn(messages, undefined, model, deps.onDelta),
        PROVIDER_TIMEOUT_MS,
        "provider",
      );
      deps.appendAssistant(final.text, []);
      return { text: final.text, finish: "capped", toolSteps };
    }

    for (const tc of turn.toolCalls) {
      if (signal?.aborted) {
        // close out each call so the transcript stays coherent
        messages.push({
          role: "tool",
          content: "Stopped by the user.",
          toolCallId: tc.id,
          name: tc.name,
        });
        deps.appendTool(tc.id, tc.name, "Stopped by the user.");
        deps.onStep({
          step: ++toolSteps,
          toolCallId: tc.id,
          tool: tc.name,
          args: tc.args,
          result: "Stopped by the user.",
        });
        continue;
      }

      let approval: ApprovalOutcome | undefined;
      let blocked = false;
      if (isDestructive(tc.name)) {
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

      let result: string;
      if (blocked) {
        result = approval!.detail;
      } else {
        try {
          result = await withTimeout(
            Promise.resolve(runTool(tc.name, tc.args, ctx)),
            TOOL_TIMEOUT_MS,
            `tool ${tc.name}`,
          );
        } catch (e) {
          result = `ERROR: ${tc.name} failed: ${e instanceof Error ? e.message : String(e)}`;
        }
        result = truncateResult(result);
      }

      toolSteps++;
      messages.push({ role: "tool", content: result, toolCallId: tc.id, name: tc.name });
      deps.appendTool(tc.id, tc.name, result);
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

  // Aborted: persist what we have so the transcript stays coherent
  if (!text) text = "(stopped)";
  deps.appendAssistant(text, []);
  return { text, finish: capped ? "capped" : "stop", toolSteps };
}
