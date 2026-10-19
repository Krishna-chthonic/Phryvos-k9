import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { runMigrations } from "../lib/db/migrate.ts";
import { runAgentTurn } from "../lib/agent/loop.ts";
import { ensureAgentTools } from "../lib/agent/tools.ts";
import { resolveApproval, _clearApprovals } from "../lib/agent/guardrails.ts";
import { readFile } from "../lib/vault-service.ts";
import type { LlmClient, ToolCall, TurnResult } from "../lib/ai/types.ts";

/**
 * Fake LLM: replays a scripted sequence of turns (tool calls → final text),
 * so the loop can be tested offline without a provider.
 */
function fakeClient(
  script: Array<{ text?: string; calls?: Array<{ name: string; args: Record<string, unknown> }> }>,
): LlmClient {
  let i = 0;
  return {
    createTurn(
      _messages,
      _tools,
      _model,
      onDelta,
    ): Promise<TurnResult> {
      const step = script[i] ?? { text: "done." };
      i++;
      return Promise.resolve({
        text: step.text ?? "",
        toolCalls: (step.calls ?? []).map(
          (c, j): ToolCall => ({ id: `call_${i}_${j}`, name: c.name, args: c.args }),
        ),
        finish: (step.calls?.length ? "tool_calls" : "stop") as TurnResult["finish"],
      }).then((r) => {
        if (onDelta && step.text) onDelta(step.text);
        return r;
      });
    },
    testConnection: async () => ({ ok: true }),
  };
}

let db: Database.Database;
const key = randomBytes(32);
let tmpDir: string;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phryvos-agent-"));
  const p = path.join(tmpDir, "vault.db");
  process.env.VAULT_DB_PATH = p;
  db = new Database(p);
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  ensureAgentTools();
});

after(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  _clearApprovals();
  delete process.env.VAULT_DB_PATH;
});

const ctx = () => ({ db, key });

describe("agent loop (fake LLM)", () => {
  it("runs a multi-step tool sequence and persists every message", async () => {
    const client = fakeClient([
      { text: "", calls: [{ name: "create_project", args: { title: "Phryvos" } }] },
      {
        text: "",
        calls: [
          { name: "create_task", args: { title: "Design", projectId: 1 } },
          { name: "create_task", args: { title: "Build", projectId: 1 } },
          { name: "create_task", args: { title: "Ship", projectId: 1 } },
        ],
      },
      { text: "Project Phryvos created with 3 tasks." },
    ]);

    const persisted: Array<{ role: string; content: string; toolCalls: ToolCall[] }> = [];
    let steps = 0;
    const res = await runAgentTurn({
      ...ctx(),
      client,
      model: "test",
      initialMessages: [{ role: "user", content: "Create the project Phryvos with 3 tasks" }],
      onDelta: () => {},
      onStep: (s) => {
        steps++;
        void s;
      },
      onApprovalRequest: () => {
        throw new Error("no destructive tools expected here");
      },
      appendAssistant: (text, toolCalls) =>
        persisted.push({ role: "assistant", content: text, toolCalls }),
      appendTool: (_id, _name, content) =>
        persisted.push({ role: "tool", content, toolCalls: [] }),
    });

    assert.equal(res.finish, "stop");
    assert.equal(res.toolSteps, 4);
    assert.equal(steps, 4);
    // final text was streamed + persisted last (may contain <think> block)
    assert.ok(res.text.includes("Project Phryvos created with 3 tasks."));
    assert.equal(persisted[persisted.length - 1].content, res.text);
    // DB actually changed
    const p = db.prepare("SELECT * FROM projects WHERE title = ?").get("Phryvos") as
      | { id: number }
      | undefined;
    assert.ok(p, "project row created");
    const tasks = db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE project_id = ?").get(
      p!.id,
    ) as { n: number };
    assert.equal(tasks.n, 3);
  });

  it("gates destructive tools on approval and honors 'allow'", async () => {
    const client = fakeClient([
      {
        text: "",
        calls: [
          {
            name: "write_file",
            args: { path: "/notes/groceries.md", content: "milk\nbread\n" },
          },
        ],
      },
      { text: "Saved your grocery list." },
    ]);

    let askedId: string | null = null;
    const p = runAgentTurn({
      ...ctx(),
      client,
      model: "test",
      initialMessages: [{ role: "user", content: "Save a grocery list" }],
      onDelta: () => {},
      onStep: () => {},
      onApprovalRequest: (a) => {
        askedId = a.approvalId;
      },
      appendAssistant: () => {},
      appendTool: () => {},
    });

    // wait for the approval request, then answer it
    while (!askedId) await new Promise((r) => setTimeout(r, 5));
    const r = resolveApproval(askedId, "allow");
    assert.equal(r.ok, true);
    const res = await p;
    assert.equal(res.finish, "stop");
    assert.match(res.text, /grocery list/i);
    // the file was actually written through the encrypted vault
    const bytes = readFile(ctx(), "/notes/groceries.md").bytes;
    assert.equal(bytes.toString("utf8"), "milk\nbread\n");
  });

  it("denied approvals feed back into the model as a tool result", async () => {
    const seenToolResults: string[] = [];
    const client: LlmClient = {
      createTurn: async (messages, _t, _m) => {
        // after the first (tool-calling) turn, inspect the tool result
        if (messages.some((mm) => mm.role === "tool")) {
          const tr = messages.find((mm) => mm.role === "tool")!;
          seenToolResults.push(String(tr.content));
          return { text: "Skipped as requested.", toolCalls: [], finish: "stop" };
        }
        return {
          text: "",
          toolCalls: [
            { id: "c1", name: "delete_file", args: { path: "/notes/groceries.md" } },
          ],
          finish: "tool_calls",
        };
      },
      testConnection: async () => ({ ok: true }),
    };

    let askedId: string | null = null;
    const p = runAgentTurn({
      ...ctx(),
      client,
      model: "test",
      initialMessages: [{ role: "user", content: "Delete the list" }],
      onDelta: () => {},
      onStep: () => {},
      onApprovalRequest: (a) => {
        askedId = a.approvalId;
      },
      appendAssistant: () => {},
      appendTool: () => {},
    });
    while (!askedId) await new Promise((r) => setTimeout(r, 5));
    assert.equal(resolveApproval(askedId, "deny").ok, true);
    const res = await p;
    assert.ok(res.text.includes("Skipped as requested."));
    assert.match(seenToolResults[0], /denied/i);
    // and the file survived
    assert.ok(readFile(ctx(), "/notes/groceries.md").bytes.length > 0);
  });

  it("zod-invalid tool args come back as model-visible errors, not crashes", async () => {
    const results: string[] = [];
    const client: LlmClient = {
      createTurn: async (messages) => {
        if (messages.some((mm) => mm.role === "tool"))
          return { text: "fixed.", toolCalls: [], finish: "stop" };
        return {
          text: "",
          toolCalls: [
            // progressPct out of range → zod rejects
            {
              id: "c1",
              name: "exam_progress_update",
              args: { topic: "Algebra", progressPct: 400 },
            },
          ],
          finish: "tool_calls",
        };
      },
      testConnection: async () => ({ ok: true }),
    };
    await runAgentTurn({
      ...ctx(),
      client,
      model: "test",
      initialMessages: [{ role: "user", content: "x" }],
      onDelta: () => {},
      onStep: (s) => results.push(s.result),
      onApprovalRequest: () => {},
      appendAssistant: () => {},
      appendTool: () => {},
    });
    assert.match(results[0], /invalid arguments/i);
  });
});
