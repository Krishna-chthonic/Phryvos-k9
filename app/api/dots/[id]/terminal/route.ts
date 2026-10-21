import { z } from "zod";
import { exec } from "node:child_process";
import fs from "node:fs";
import { requireVault, vaultGuardResponse, internalResponse } from "@/server/vault-guard";
import { getDot, appendDotMessage } from "@/lib/dots-service";
import { lintShellCommand, lintPath } from "@/lib/agent/safety-linter";

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

    const body = await req.json();
    const { command, cwd: requestedCwd } = TerminalBodySchema.parse(body);

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

    const workingDir = requestedCwd && fs.existsSync(requestedCwd)
      ? requestedCwd
      : dot.workingDirectory && fs.existsSync(dot.workingDirectory)
      ? dot.workingDirectory
      : process.cwd();

    const env = {
      ...process.env,
      PATH: `/usr/bin:/usr/sbin:/sbin:/bin:/usr/local/bin:${process.env.PATH || ""}`,
    };

    return new Promise<Response>((resolve) => {
      exec(command, { cwd: workingDir, env, timeout: 30_000 }, (err, stdout, stderr) => {
        const exitCode = err ? (err.code ?? 1) : 0;
        const resultText = (stdout || stderr || (exitCode === 0 ? "Command succeeded (no output)" : "Command failed")).trim();

        // Record terminal takeover action into Dot memory
        appendDotMessage(ctx, id, {
          role: "tool",
          content: `$ ${command}\n${resultText}`,
          toolName: "terminal",
          toolArgs: JSON.stringify({ command, cwd: workingDir }),
          toolResult: resultText,
        });

        resolve(
          Response.json({
            command,
            stdout,
            stderr: stderr || (err ? err.message : ""),
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
