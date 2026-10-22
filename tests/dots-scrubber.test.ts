import test from "node:test";
import assert from "node:assert/strict";
import { scrubSecrets } from "@/lib/dots/secret-scrubber";

test("D-19: Secret Scrubber for Dot broadcasts and notifications", async (t) => {
  await t.test("redacts OpenAI and Anthropic API keys", () => {
    const text = "Found key sk-proj-1234567890abcdef1234567890abcdef and sk-ant-api03-abcdef1234567890abcdef in config.";
    const scrubbed = scrubSecrets(text);
    assert.ok(!scrubbed.includes("sk-proj-1234567890abcdef"));
    assert.ok(!scrubbed.includes("sk-ant-api03-abcdef"));
    assert.match(scrubbed, /\[REDACTED_API_KEY\]/);
  });

  await t.test("redacts Bearer tokens and Authorization headers", () => {
    const text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ID";
    const scrubbed = scrubSecrets(text);
    assert.ok(!scrubbed.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    assert.match(scrubbed, /Bearer \[REDACTED_TOKEN\]/);
  });

  await t.test("redacts passwords in URLs and credentials", () => {
    const text = "Connecting to postgres://admin:superSecretP@ss123@db.internal:5432/vault";
    const scrubbed = scrubSecrets(text);
    assert.ok(!scrubbed.includes("superSecretP@ss123"));
    assert.match(scrubbed, /postgres:\/\/admin:\[REDACTED\]@db\.internal/);
  });

  await t.test("preserves non-sensitive text and code blocks", () => {
    const text = "Running `git status` on branch main with 3 uncommitted files.";
    const scrubbed = scrubSecrets(text);
    assert.equal(scrubbed, text);
  });
});
