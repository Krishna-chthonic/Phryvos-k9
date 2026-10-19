import { z } from "zod";

export const MemoryCategorySchema = z.enum(["preference", "fact", "goal", "exam", "general"]);
export type MemoryCategory = z.infer<typeof MemoryCategorySchema>;

export const PermanentMemorySchema = z.object({
  id: z.number().int().positive(),
  content: z.string().min(1).max(2000),
  category: MemoryCategorySchema.default("general"),
  tags: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type PermanentMemory = z.infer<typeof PermanentMemorySchema>;

export const ShortTermMemorySchema = z.object({
  id: z.number().int().positive(),
  sessionKey: z.string().min(1),
  observation: z.string().min(1),
  salienceScore: z.number().min(0).max(1),
  consolidated: z.boolean().default(false),
  createdAt: z.number(),
});
export type ShortTermMemory = z.infer<typeof ShortTermMemorySchema>;
