import { z } from "zod";

export const meetingAiProviderSchema = z.enum(["gemini", "openai"]);
export const meetingInputTypeSchema = z.enum(["transcript", "audio"]);
export const transcriptionProviderSchema = z.enum(["gemini"]);

export const meetingSummarizerInputSchema = z.object({
  inputType: meetingInputTypeSchema.default("transcript"),
  provider: meetingAiProviderSchema,
  transcriptionProvider: transcriptionProviderSchema.optional(),
  audioFileName: z.string().trim().optional(),
  audioMimeType: z.string().trim().optional(),
  originalTranscript: z.string().trim().optional(),
  transcript: z
    .string()
    .trim()
    .min(80, "Transcript must be at least 80 characters long to generate a useful summary.")
});

export const meetingActionItemSchema = z.object({
  task: z.string().trim().min(1, "Task is required."),
  owner: z.string().trim(),
  deadline: z.string().trim()
});

export const meetingSummarizerOutputSchema = z.object({
  summary: z.string().trim().min(1, "Summary is required."),
  key_points: z.array(z.string().trim().min(1, "Key point cannot be empty.")).min(1, "At least one key point is required."),
  action_items: z.array(meetingActionItemSchema)
});
