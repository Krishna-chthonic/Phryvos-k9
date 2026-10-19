import { z } from "zod";

export const ThemeModeSchema = z.enum(["dark", "light", "system"]);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const UserSettingsSchema = z.object({
  theme: ThemeModeSchema.default("dark"),
  defaultProviderId: z.number().nullable().default(null),
  defaultModel: z.string().default("gpt-4o"),
  enableExtendedThinking: z.boolean().default(true),
  autoCompactionThreshold: z.number().min(10).max(500).default(50),
  soundEffects: z.boolean().default(false),
  activeExamSubjectId: z.number().nullable().default(null),
  updatedAt: z.number().default(() => Date.now()),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;
