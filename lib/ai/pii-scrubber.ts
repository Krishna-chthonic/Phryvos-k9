/**
 * Local PII & Secret Redaction Engine (Privacy Shield)
 * Inspired by Ruflo / Enterprise Privacy Guardrails
 * 
 * Runs 100% locally in-memory before sending prompts or tool outputs to external LLMs.
 * Masks credentials, API keys, private keys, emails, phone numbers, and credit cards
 * with deterministic placeholders (e.g. {{K9_SECRET_APIKEY_1}}), and unmasks them
 * locally when the model completes its turn.
 */

import type {
  LlmClient,
  UnifiedMessage,
  UnifiedPart,
  TurnResult,
  ToolCall,
} from "./types";

export type SecretCategory =
  | "APIKEY"
  | "PRIVKEY"
  | "JWT"
  | "CREDENTIAL"
  | "EMAIL"
  | "PHONE"
  | "CARD";

export interface ScrubberSession {
  /** Map raw secret -> placeholder token */
  forwardMap: Map<string, string>;
  /** Map placeholder token -> raw secret */
  reverseMap: Map<string, string>;
  /** Counter per category for clean numbering */
  counters: Record<SecretCategory, number>;
}

export function createScrubberSession(): ScrubberSession {
  return {
    forwardMap: new Map(),
    reverseMap: new Map(),
    counters: {
      APIKEY: 0,
      PRIVKEY: 0,
      JWT: 0,
      CREDENTIAL: 0,
      EMAIL: 0,
      PHONE: 0,
      CARD: 0,
    },
  };
}

/**
 * Validates credit card number with Luhn algorithm to prevent false positives
 */
function isValidLuhn(digitsOnly: string): boolean {
  if (digitsOnly.length < 13 || digitsOnly.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let digit = parseInt(digitsOnly.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

interface PatternRule {
  category: SecretCategory;
  regex: RegExp;
  validator?: (match: string) => boolean;
}

const SCRUB_RULES: PatternRule[] = [
  // 1. Private Keys (RSA, EC, PGP)
  {
    category: "PRIVKEY",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  // 2. OpenAI & Anthropic API Keys
  {
    category: "APIKEY",
    regex: /\b(sk-[a-zA-Z0-9_-]{20,}|sk-ant-[a-zA-Z0-9_-]{20,})\b/g,
  },
  // 3. GitHub Personal Access Tokens (classic & fine-grained)
  {
    category: "APIKEY",
    regex: /\b(ghp_[a-zA-Z0-9]{30,40}|github_pat_[a-zA-Z0-9_]{50,90})\b/g,
  },
  // 4. Google AI Studio & Cloud API Keys
  {
    category: "APIKEY",
    regex: /\b(AIzaSy[a-zA-Z0-9_-]{33})\b/g,
  },
  // 5. AWS Access Keys
  {
    category: "APIKEY",
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
  },
  // 6. Hugging Face Tokens
  {
    category: "APIKEY",
    regex: /\b(hf_[a-zA-Z0-9]{34,})\b/g,
  },
  // 7. Slack API Tokens
  {
    category: "APIKEY",
    regex: /\b(xox[baprs]-[a-zA-Z0-9-]{10,})\b/g,
  },
  // 8. JSON Web Tokens (JWT) & Bearer headers
  {
    category: "JWT",
    regex: /\b(eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})\b/g,
  },
  // 9. Key-value credentials in code or env files (e.g. password="...", token=...)
  {
    category: "CREDENTIAL",
    regex: /(?<=\b(?:password|passwd|api_key|secret_key|private_key|auth_token|db_pass)\s*[:=]\s*["']?)([a-zA-Z0-9_!@#$%^&*()\-+=~]{6,})(?=["']?)/gi,
  },
  // 10. Credit Card Numbers (checked against Luhn)
  {
    category: "CARD",
    regex: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
    validator: (m) => isValidLuhn(m.replace(/[\s-]/g, "")),
  },
  // 11. Email Addresses
  {
    category: "EMAIL",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  // 12. Phone Numbers (Indian standard & International E.164)
  {
    category: "PHONE",
    regex: /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|\+\d{1,3}[\s-]?\d{3,4}[\s-]?\d{4,}\b/g,
  },
];

/**
 * Scrubs a single string, replacing sensitive tokens with deterministically
 * indexed placeholders like {{K9_SECRET_APIKEY_1}}.
 */
export function scrubText(text: string, session: ScrubberSession): string {
  if (!text || typeof text !== "string") return text;
  let result = text;

  for (const rule of SCRUB_RULES) {
    result = result.replace(rule.regex, (match) => {
      // If validator present, check if match is legitimate
      if (rule.validator && !rule.validator(match)) {
        return match;
      }

      // Check if this secret was already encountered in this session
      let placeholder = session.forwardMap.get(match);
      if (!placeholder) {
        session.counters[rule.category]++;
        placeholder = `{{K9_SECRET_${rule.category}_${session.counters[rule.category]}}}`;
        session.forwardMap.set(match, placeholder);
        session.reverseMap.set(placeholder, match);
      }
      return placeholder;
    });
  }

  return result;
}

/**
 * Replaces placeholder tokens back with their original real values.
 */
export function unmaskText(text: string, session: ScrubberSession): string {
  if (!text || typeof text !== "string" || session.reverseMap.size === 0) return text;
  let result = text;

  // Replace each known placeholder with original secret
  for (const [placeholder, original] of session.reverseMap.entries()) {
    result = result.replaceAll(placeholder, original);
  }

  return result;
}

/**
 * Recursively unmasks string values in an object or record (e.g. tool arguments)
 */
export function unmaskObject<T>(obj: T, session: ScrubberSession): T {
  if (session.reverseMap.size === 0) return obj;
  if (typeof obj === "string") {
    return unmaskText(obj, session) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => unmaskObject(item, session)) as unknown as T;
  }
  if (obj && typeof obj === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = unmaskObject(v, session);
    }
    return res as T;
  }
  return obj;
}

/**
 * Scrubs UnifiedMessages before they are converted to provider wire format.
 */
export function scrubMessages(
  messages: UnifiedMessage[],
  session: ScrubberSession,
): UnifiedMessage[] {
  return messages.map((m) => {
    let scrubbedContent: string | UnifiedPart[];
    if (typeof m.content === "string") {
      scrubbedContent = scrubText(m.content, session);
    } else if (Array.isArray(m.content)) {
      scrubbedContent = m.content.map((part) => {
        if (part.type === "text" && part.text) {
          return { ...part, text: scrubText(part.text, session) };
        }
        return part;
      });
    } else {
      scrubbedContent = m.content;
    }

    // Also scrub tool call results if attached
    const scrubbedToolCalls = m.toolCalls?.map((tc) => ({
      ...tc,
      result: tc.result ? scrubText(tc.result, session) : tc.result,
    }));

    return {
      ...m,
      content: scrubbedContent,
      toolCalls: scrubbedToolCalls,
    };
  });
}

/**
 * Decorator that wraps any LlmClient with the Local PII Scrubber.
 * Every outgoing turn is automatically scrubbed, and the response is unmasked
 * before returning to caller.
 */
export function wrapLlmClientWithScrubber(
  client: LlmClient,
  customSession?: ScrubberSession,
): LlmClient {
  const session = customSession || createScrubberSession();

  return {
    async createTurn(messages, tools, model, onDelta, options): Promise<TurnResult> {
      // 1. Scrub messages before they touch the wire
      const cleanMessages = scrubMessages(messages, session);

      // 2. Wrap delta handler so user / UI receives unmasked text in real-time
      const wrappedOnDelta = onDelta
        ? (delta: string) => {
            onDelta(unmaskText(delta, session));
          }
        : undefined;

      // 3. Execute turn through underlying provider
      const rawResult = await client.createTurn(
        cleanMessages,
        tools,
        model,
        wrappedOnDelta,
        options,
      );

      // 4. Unmask the completed turn result
      const unmaskedText = unmaskText(rawResult.text, session);
      const unmaskedToolCalls: ToolCall[] = rawResult.toolCalls.map((tc) => ({
        ...tc,
        args: unmaskObject(tc.args, session),
        result: tc.result ? unmaskText(tc.result, session) : tc.result,
      }));

      return {
        ...rawResult,
        text: unmaskedText,
        toolCalls: unmaskedToolCalls,
      };
    },

    async testConnection(model?: string) {
      return client.testConnection(model);
    },
  };
}
