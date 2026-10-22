/**
 * Sandboxed JavaScript code execution service for phryvos-k9 agent tools.
 *
 * Importers/callers: lib/agent/tools.ts, tests/file-plugins.test.ts
 * Affected API: Agent tool execution (run_js_code)
 * Data schemas if any: None (in-memory sandboxed execution)
 * User instruction verbatim: "ek last problem hai ki ai zip , pdf , etc ko read nhi kar sakta aur uske paas jyada skills and plugins nhi hai"
 */
import vm from "node:vm";

export interface CodeRunnerResult {
  success: boolean;
  output: string;
  returnedValue?: unknown;
  durationMs: number;
  error?: string;
}

/**
 * Execute a snippet of JavaScript inside an isolated Node vm sandbox with
 * strict timeouts and zero access to filesystem, child processes, or network.
 */
export function runSandboxedJs(
  code: string,
  timeoutMs = 2500,
): CodeRunnerResult {
  const start = Date.now();
  const logs: string[] = [];

  // Pre-flight sandbox security screening to block prototype escape vectors
  const blockedPatterns = [
    /\bconstructor\b/,
    /\b__proto__\b/,
    /\bprototype\b/,
    /\bprocess\b/,
    /\bglobal\b/,
    /\bglobalThis\b/,
    /\brequire\b/,
    /\bimport\b/,
    /\bFunction\b/,
    /\beval\b/,
    /\bReflect\b/,
    /\bProxy\b/,
    /\bWebAssembly\b/,
    /\bgetPrototypeOf\b/,
    /\bsetPrototypeOf\b/,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(code)) {
      return {
        success: false,
        output: "",
        error: `Security Exception: Access to restricted identifier (${pattern.source}) is prohibited in the sandbox.`,
        durationMs: Date.now() - start,
      };
    }
  }

  const sandbox: Record<string, unknown> = {
    console: {
      log: (...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
      },
      info: (...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
      },
      warn: (...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
      },
      error: (...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
      },
    },
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
  };

  try {
    const context = vm.createContext(sandbox);

    // Wrap in an isolated closure with defensive prototype guards
    const wrapped = `
      (() => {
        "use strict";
        try {
          Object.defineProperty(Object.prototype, '__proto__', {
            get() { throw new Error('Security Exception: __proto__ access is prohibited'); },
            set() { throw new Error('Security Exception: __proto__ mutation is prohibited'); },
            configurable: false,
          });
        } catch (_) {}
        ${code}
      })()
    `;

    const script = new vm.Script(wrapped);
    const returnedValue = script.runInContext(context, {
      timeout: timeoutMs,
      displayErrors: true,
    });

    const durationMs = Date.now() - start;
    let output = logs.join("\n");
    if (returnedValue !== undefined) {
      const retStr =
        typeof returnedValue === "object"
          ? JSON.stringify(returnedValue, null, 2)
          : String(returnedValue);
      output = output ? `${output}\n\nReturned: ${retStr}` : `Returned: ${retStr}`;
    }

    return {
      success: true,
      output: output || "(executed successfully with no output)",
      returnedValue,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: logs.join("\n"),
      error: msg,
      durationMs,
    };
  }
}
