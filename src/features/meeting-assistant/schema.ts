import { z } from "zod";
import { supportedAgentPlatformSchema } from "@/features/agent-audio/schema";
import { meetingActionItemSchema } from "@/features/tools/meeting-summarizer/schema";

export const meetingSessionProviderSchema = supportedAgentPlatformSchema;
export const meetingAssistantSourceSchema = z.literal("google_calendar");
export const meetingSessionStatusSchema = z.enum([
  "draft",
  "joining",
  "waiting_for_join",
  "joined",
  "capturing",
  "recording",
  "recorded",
  "processing_transcript",
  "transcribed",
  "processing_summary",
  "processing",
  "completed",
  "failed"
]);

export const createMeetingSessionSchema = z.object({
  title: z.string().trim().min(3, "Meeting title must be at least 3 characters long."),
  meetingLink: z.string().trim().url("Enter a valid meeting link."),
  externalCalendarEventId: z.string().trim().max(255).optional().nullable(),
  scheduledStartTime: z.string().datetime().optional().nullable(),
  scheduledEndTime: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(5000, "Notes are too long.").optional().or(z.literal("")),
  provider: meetingSessionProviderSchema.default("google_meet")
});

export const updateMeetingSessionSchema = z.object({
  title: z.string().trim().min(3, "Meeting title must be at least 3 characters long.").optional(),
  meetingLink: z.string().trim().url("Enter a valid meeting link.").optional(),
  externalCalendarEventId: z.string().trim().max(255).optional().nullable(),
  scheduledStartTime: z.string().datetime().optional().nullable(),
  scheduledEndTime: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(5000, "Notes are too long.").optional().or(z.literal("")),
  transcript: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  followUpEmail: z.string().trim().optional(),
  keyPoints: z.array(z.string().trim().min(1, "Key point cannot be empty.")).optional(),
  actionItems: z.array(meetingActionItemSchema).optional(),
  emailSent: z.boolean().optional(),
  emailSentAt: z.string().trim().optional().nullable(),
  status: meetingSessionStatusSchema.optional(),
  aiRunId: z.string().uuid("Invalid AI run id.").optional()
});

export const meetingSessionRecordSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  meetingLink: z.string().url(),
  externalCalendarEventId: z.string().nullable(),
  provider: meetingSessionProviderSchema,
  scheduledStartTime: z.string().nullable(),
  scheduledEndTime: z.string().nullable(),
  notes: z.string().nullable(),
  transcript: z.string().nullable(),
  summary: z.string().nullable(),
  followUpEmail: z.string().nullable(),
  keyPoints: z.array(z.string()).default([]),
  actionItems: z.array(meetingActionItemSchema).default([]),
  emailSent: z.boolean().default(false),
  emailSentAt: z.string().nullable(),
  status: meetingSessionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const meetingAssistantPrefillSchema = z.object({
  title: z.string().trim().min(1).optional(),
  meetingLink: z.string().trim().url().optional(),
  provider: meetingSessionProviderSchema.optional(),
  startTime: z.string().trim().min(1).optional(),
  endTime: z.string().trim().min(1).optional(),
  source: meetingAssistantSourceSchema.optional(),
  eventId: z.string().trim().min(1).optional()
});
