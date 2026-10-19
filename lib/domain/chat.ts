import { z } from "zod";

export const MessageRoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const UnifiedPartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("image"),
    dataBase64: z.string().optional(),
    mediaType: z.string().optional(),
    url: z.string().optional(),
  }),
  z.object({
    type: z.literal("tool_call"),
    id: z.string(),
    name: z.string(),
    args: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("tool_result"),
    toolCallId: z.string(),
    toolName: z.string().optional(),
    result: z.string(),
    isError: z.boolean().optional(),
  }),
]);
export type UnifiedPart = z.infer<typeof UnifiedPartSchema>;

export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: MessageRoleSchema,
  content: z.union([z.string(), z.array(UnifiedPartSchema)]),
  toolCalls: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
  createdAt: z.number(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatSessionMetaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(255),
  providerId: z.number().nullable().optional(),
  model: z.string().nullable().optional(),
  mode: z.string().default("default"),
  effort: z.string().default("medium"),
  summary: z.string().nullable().optional(),
  messageCount: z.number().nonnegative().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type ChatSessionMeta = z.infer<typeof ChatSessionMetaSchema>;
