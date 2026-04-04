import { z } from "zod";

export const emailNotificationsSchema = z.object({
  meetingSummary: z.boolean(),
  actionItems: z.boolean(),
  weeklyDigest: z.boolean(),
  productUpdates: z.boolean()
});

export const emailToneSchema = z.enum([
  "professional",
  "friendly",
  "formal",
  "concise"
]);

export const summaryLengthSchema = z.enum(["brief", "standard", "detailed"]);

export const languageSchema = z.enum(["en", "hi"]);

export const preferencesSchema = z.object({
  emailNotifications: emailNotificationsSchema.optional(),
  defaultEmailTone: emailToneSchema.optional(),
  summaryLength: summaryLengthSchema.optional(),
  language: languageSchema.optional()
});

export const botSettingsSchema = z.object({
  botDisplayName: z.string().min(1, "Bot display name cannot be empty"),
  audioSource: z.string().optional()
});

export type EmailNotifications = z.infer<typeof emailNotificationsSchema>;
export type EmailTone = z.infer<typeof emailToneSchema>;
export type SummaryLength = z.infer<typeof summaryLengthSchema>;
export type Language = z.infer<typeof languageSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type BotSettingsInput = z.infer<typeof botSettingsSchema>;
