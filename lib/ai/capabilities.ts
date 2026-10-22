export interface ModelCapabilities {
  supportsVision: boolean;
  supportsTools: boolean;
  supportsThinking: boolean;
  supportsStreaming: boolean;
  contextWindow: number;
  maxOutputTokens: number;
}

export function getModelCapabilities(modelId: string): ModelCapabilities {
  const m = modelId.toLowerCase();

  // Claude models
  if (m.includes("claude")) {
    const isVision = !m.includes("claude-2") && !m.includes("instant");
    const isThinking = m.includes("3-7") || m.includes("thinking") || m.includes("sonnet");
    return {
      supportsVision: isVision,
      supportsTools: true,
      supportsThinking: isThinking,
      supportsStreaming: true,
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
    };
  }

  // OpenAI models
  if (m.includes("gpt-4o") || m.includes("gpt-4-turbo")) {
    return {
      supportsVision: true,
      supportsTools: true,
      supportsThinking: false,
      supportsStreaming: true,
      contextWindow: 128_000,
      maxOutputTokens: 4_096,
    };
  }

  if (m.startsWith("o1") || m.startsWith("o3")) {
    const isMini = m.includes("mini");
    return {
      supportsVision: !isMini, // o1 supports vision; o1-mini does not
      supportsTools: true,
      supportsThinking: true,
      supportsStreaming: true,
      contextWindow: isMini ? 128_000 : 200_000,
      maxOutputTokens: 65_536,
    };
  }

  // Gemini models
  if (m.includes("gemini")) {
    return {
      supportsVision: true,
      supportsTools: true,
      supportsThinking: m.includes("thinking"),
      supportsStreaming: true,
      contextWindow: m.includes("1.5") || m.includes("2.0") ? 1_000_000 : 128_000,
      maxOutputTokens: 8_192,
    };
  }

  // DeepSeek models
  if (m.includes("deepseek")) {
    const isReasoner = m.includes("reasoner") || m.includes("r1");
    return {
      supportsVision: false,
      supportsTools: !isReasoner, // Pure reasoning models generally use prompt-based completions or internal thought
      supportsThinking: isReasoner,
      supportsStreaming: true,
      contextWindow: 64_000,
      maxOutputTokens: 8_000,
    };
  }

  // Qwen models
  if (m.includes("qwen")) {
    const isVl = m.includes("vl");
    return {
      supportsVision: isVl,
      supportsTools: true,
      supportsThinking: m.includes("qwq"),
      supportsStreaming: true,
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
    };
  }

  // Default fallback
  return {
    supportsVision: false,
    supportsTools: true,
    supportsThinking: false,
    supportsStreaming: true,
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
  };
}

export function validateAttachmentsForModel(
  modelId: string,
  attachments: Array<{ mime?: string }>,
): { valid: boolean; error?: string } {
  if (!attachments || attachments.length === 0) {
    return { valid: true };
  }

  const caps = getModelCapabilities(modelId);
  const hasImages = attachments.some(
    (a) => a.mime && (a.mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].some((ext) => a.mime?.includes(ext))),
  );

  if (hasImages && !caps.supportsVision) {
    return {
      valid: false,
      error: `Model "${modelId}" does not support image attachments. Please select a vision-capable model (such as Claude 3.5 Sonnet or GPT-4o).`,
    };
  }

  return { valid: true };
}
