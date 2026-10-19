import { z } from "zod";

export const ProviderKindSchema = z.enum(["openai", "anthropic"]);
export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const ProviderMetaSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(100),
  kind: ProviderKindSchema,
  baseUrl: z.string().url(),
  models: z.array(z.string()),
  isDefault: z.boolean(),
  hasKey: z.boolean(),
  createdAt: z.number(),
});
export type ProviderMeta = z.infer<typeof ProviderMetaSchema>;

export const ProviderInputSchema = z.object({
  name: z.string().min(1).max(100),
  kind: ProviderKindSchema,
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  models: z.array(z.string()).default([]),
  isDefault: z.boolean().default(false),
});
export type ProviderInput = z.infer<typeof ProviderInputSchema>;
