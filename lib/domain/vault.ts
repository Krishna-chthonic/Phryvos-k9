import { z } from "zod";

export const VaultPathSchema = z
  .string()
  .min(1)
  .regex(/^\/[a-zA-Z0-9_\-./ ]*$/, "Path must start with '/' and contain safe characters");

export const VaultFileMetaSchema = z.object({
  id: z.number().int().positive(),
  path: VaultPathSchema,
  parentPath: z.string(),
  name: z.string().min(1),
  isDir: z.boolean(),
  sizeBytes: z.number().nonnegative(),
  mime: z.string().nullable(),
  version: z.number().int().positive(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type VaultFileMeta = z.infer<typeof VaultFileMetaSchema>;
