import { z } from "zod";
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { getDot, appendDotMessage } from "@/lib/dots-service";
import { lintShellCommand } from "@/lib/agent/safety-linter";
import { validateTerminalWorkingDir } from "@/lib/dots/terminal-guard";
import { scrubSecrets } from "@/lib/dots/secret-scrubber";

const TerminalBodySchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    const ctx = await requireVault();
    const dot = getDot(ctx, id);
    if (!dot) {
      return Response.json({ error: { code: "not_found", message: "Dot not found" } }, { status: 404 });
    }

    // Verify Dot permission boundary
    if (!dot.tools.includes("terminal")) {
      return Response.json(
        { error: { code: "tool_disabled", message: `Terminal tool is not enabled for ${dot.name}` } },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { command, cwd: requestedCwd } = TerminalBodySchema.parse(body);

    // Reject null byte injection
    if (command.includes("\0")) {
      return Response.json({
        command,
        stdout: "",
        stderr: "Invalid shell command: null bytes rejected",
        exitCode: 1,
        cwd: dot.workingDirectory || process.cwd(),
      });
    }

    // Pre-flight safety check
    const shellCheck = lintShellCommand(command);
    if (!shellCheck.ok) {
      return Response.json({
        command,
        stdout: "",
        stderr: shellCheck.reason,
        exitCode: 126,
        cwd: requestedCwd || dot.workingDirectory || process.cwd(),
      });
    }

    // Strictly confine working directory to dot workspace sandbox
    const baseWorkspace = dot.workingDirectory || process.cwd();
    const dirValidation = validateTerminalWorkingDir(baseWorkspace, requestedCwd);
    if (!dirValidation.ok || !dirValidation.resolvedPath) {
      return Response.json({
        command,
        stdout: "",
        stderr: dirValidation.error || "Working directory sandbox violation",
        exitCode: 126,
        cwd: baseWorkspace,
      });
    }
    const workingDir = dirValidation.resolvedPath;

    // Filter environment to prevent leaking vault secrets or tokens to subprocess
    const env: NodeJS.ProcessEnv = {
      PATH: `/usr/bin:/usr/sbin:/sbin:/bin:/usr/local/bin:${process.env.PATH || ""}`,
      HOME: process.env.HOME || "/root",
      USER: process.env.USER || "termux",
      SHELL: process.env.SHELL || "/bin/bash",
      TERM: "xterm-256color",
      PWD: workingDir,
      NODE_ENV: (process.env.NODE_ENV as "development" | "production" | "test") || "production",
      DOT_NAME: dot.name,
      DOT_ID: dot.id,
    };

    return new Promise<Response>((resolve) => {
      exec(command, { cwd: workingDir, env, timeout: 30_000, maxBuffer: 1024 * 512 }, (err: any, stdout: string, stderr: string) => {
        const exitCode = err ? (err.code ?? 1) : 0;
        const resultText = (stdout || stderr || (exitCode === 0 ? "Command succeeded (no output)" : "Command failed")).trim();
        const cleanStdout = scrubSecrets(stdout);
        const cleanStderr = scrubSecrets(stderr || (err ? err.message : ""));
        const cleanResultText = scrubSecrets(resultText);

        // Record terminal takeover action into Dot memory (scrubbed)
        appendDotMessage(ctx, id, {
          role: "tool",
          content: `$ ${command}\n${cleanResultText}`,
          toolName: "terminal",
          toolArgs: JSON.stringify({ command, cwd: workingDir }),
          toolResult: cleanResultText,
        });

        resolve(
          Response.json({
            command,
            stdout: cleanStdout,
            stderr: cleanStderr,
            exitCode,
            cwd: workingDir,
          })
        );
      });
    });
  } catch (e) {
    const auth = vaultGuardResponse(e);
    if (auth) return auth;
    if (e instanceof z.ZodError) {
      return Response.json({ error: { code: "invalid_input", issues: e.issues } }, { status: 400 });
    }
    return internalResponse(e);
  }
}
