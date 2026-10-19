import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  UserSettingsSchema,
  ChatMessageSchema,
  ProviderInputSchema,
  VaultFileMetaSchema,
  PermanentMemorySchema,
  TaskRowSchema,
  ApprovalRequestSchema,
  validateDomain,
  safeValidateDomain,
  DomainValidationError,
} from "../lib/domain/index.ts";

describe("Phase 7: Shared Domain Models & Validation", () => {
  it("validates user settings with defaults", () => {
    const valid = validateDomain(UserSettingsSchema, {
      theme: "dark",
      defaultModel: "claude-3-5-sonnet",
    });
    assert.equal(valid.theme, "dark");
    assert.equal(valid.enableExtendedThinking, true);
    assert.equal(valid.autoCompactionThreshold, 50);

    const invalid = safeValidateDomain(UserSettingsSchema, {
      theme: "neon-pink", // invalid enum
    });
    assert.equal(invalid.success, false);
  });

  it("validates chat message schemas and discriminated parts", () => {
    const valid = validateDomain(ChatMessageSchema, {
      id: "msg-123",
      sessionId: "sess-456",
      role: "user",
      content: [
        { type: "text", text: "Explain Lenz Law in Electrodynamics" },
        { type: "image", dataBase64: "dGVzdA==", mediaType: "image/png" },
      ],
      createdAt: Date.now(),
    });
    assert.equal(valid.role, "user");
    assert.ok(Array.isArray(valid.content));

    assert.throws(
      () =>
        validateDomain(ChatMessageSchema, {
          id: "", // min 1
          sessionId: "sess-1",
          role: "superadmin", // invalid role
          content: "test",
          createdAt: Date.now(),
        }),
      (err: unknown) => err instanceof DomainValidationError,
    );
  });

  it("validates provider configs and URLs", () => {
    const valid = validateDomain(ProviderInputSchema, {
      name: "Local Ollama",
      kind: "openai",
      baseUrl: "http://127.0.0.1:11434/v1",
      models: ["llama3", "mistral"],
    });
    assert.equal(valid.name, "Local Ollama");

    const invalidUrl = safeValidateDomain(ProviderInputSchema, {
      name: "Broken",
      kind: "openai",
      baseUrl: "not-a-valid-url",
    });
    assert.equal(invalidUrl.success, false);
  });

  it("validates vault paths and prevents path traversal", () => {
    const valid = validateDomain(VaultFileMetaSchema, {
      id: 1,
      path: "/notes/physics.md",
      parentPath: "/notes",
      name: "physics.md",
      isDir: false,
      sizeBytes: 1024,
      mime: "text/markdown",
      version: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });
    assert.equal(valid.path, "/notes/physics.md");

    const invalidPath = safeValidateDomain(VaultFileMetaSchema, {
      id: 2,
      path: "notes/relative.md", // missing leading slash
      parentPath: "",
      name: "relative.md",
      isDir: false,
      sizeBytes: 100,
      mime: null,
      version: 1,
      createdAt: 1000,
      updatedAt: 1000,
    });
    assert.equal(invalidPath.success, false);
  });

  it("validates memory and tracking entities", () => {
    const memory = validateDomain(PermanentMemorySchema, {
      id: 10,
      content: "User prefers step-by-step calculus derivations",
      category: "preference",
      tags: ["math", "calculus"],
      createdAt: 1000,
      updatedAt: 1000,
    });
    assert.equal(memory.category, "preference");

    const task = validateDomain(TaskRowSchema, {
      id: 5,
      projectId: null,
      title: "Derive Maxwell Equations",
      description: null,
      status: "todo",
      priority: 2,
      dueDate: "2026-11-01",
      startDate: null,
      tags: ["physics"],
      completedAt: null,
      createdAt: 1000,
      updatedAt: 1000,
    });
    assert.equal(task.priority, 2);
  });

  it("validates security governance approval requests", () => {
    const req = validateDomain(ApprovalRequestSchema, {
      approvalId: "appr-abc-123",
      tool: "delete_file",
      args: { path: "/important.txt" },
      description: "Delete vault file /important.txt",
    });
    assert.equal(req.tool, "delete_file");
  });
});
