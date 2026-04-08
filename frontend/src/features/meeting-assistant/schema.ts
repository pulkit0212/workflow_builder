import { z } from "zod";
import { supportedAgentPlatformSchema } from "@/features/agent-audio/schema";
import { meetingActionItemSchema } from "@/features/tools/meeting-summarizer/schema";

export const meetingSessionProviderSchema = supportedAgentPlatformSchema;
export const meetingAssistantSourceSchema = z.literal("google_calendar");
export const meetingSessionStatusSchema = z.enum([
  "draft",
  "joining",
  "waiting_for_join",
  "waiting_for_admission",
  "joined",
  "capturing",
  "recording",
  "recorded",
  "processing_transcript",
  "transcribed",
  "processing_summary",
  "processing",
  "summarizing",
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
  errorCode: z.string().trim().max(100, "Error code is too long.").optional().nullable(),
  failureReason: z.string().trim().max(5000, "Failure reason is too long.").optional().nullable(),
  transcript: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  keyDecisions: z.array(z.string().trim().min(1, "Key decision cannot be empty.")).optional(),
  risksAndBlockers: z.array(z.string().trim().min(1, "Risk or blocker cannot be empty.")).optional(),
  keyTopics: z.array(z.string().trim().min(1, "Key topic cannot be empty.")).optional(),
  meetingSentiment: z.string().trim().max(50, "Meeting sentiment is too long.").optional().nullable(),
  followUpNeeded: z.boolean().optional().nullable(),
  meetingDuration: z.number().int().nonnegative().optional().nullable(),
  followUpEmail: z.string().trim().optional(),
  keyPoints: z.array(z.string().trim().min(1, "Key point cannot be empty.")).optional(),
  actionItems: z.array(meetingActionItemSchema).optional(),
  recordingFilePath: z.string().trim().optional().nullable(),
  recordingUrl: z.string().trim().optional().nullable(),
  recordingSize: z.number().int().nonnegative().optional().nullable(),
  recordingDuration: z.number().int().nonnegative().optional().nullable(),
  recordingStartedAt: z.string().datetime().optional().nullable(),
  recordingEndedAt: z.string().datetime().optional().nullable(),
  insights: z.record(z.any()).optional().nullable(),
  chapters: z.array(z.record(z.any())).optional().nullable(),
  emailSent: z.boolean().optional(),
  emailSentAt: z.string().trim().optional().nullable(),
  status: meetingSessionStatusSchema.optional(),
  aiRunId: z.string().uuid("Invalid AI run id.").optional()
});

export const meetingSessionRecordSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid().nullable().optional(),
  title: z.string(),
  meetingLink: z.string().url(),
  externalCalendarEventId: z.string().nullable(),
  provider: meetingSessionProviderSchema,
  scheduledStartTime: z.string().nullable(),
  scheduledEndTime: z.string().nullable(),
  notes: z.string().nullable(),
  errorCode: z.string().nullable(),
  failureReason: z.string().nullable(),
  transcript: z.string().nullable(),
  summary: z.string().nullable(),
  keyDecisions: z.array(z.string()).default([]),
  risksAndBlockers: z.array(z.string()).default([]),
  keyTopics: z.array(z.string()).default([]),
  meetingSentiment: z.string().nullable(),
  followUpNeeded: z.boolean().nullable(),
  meetingDuration: z.number().int().nullable(),
  followUpEmail: z.string().nullable(),
  keyPoints: z.array(z.string()).default([]),
  actionItems: z.array(meetingActionItemSchema).default([]),
  recordingFilePath: z.string().nullable(),
  recordingUrl: z.string().nullable(),
  recordingSize: z.number().int().nullable(),
  recordingDuration: z.number().int().nullable(),
  recordingStartedAt: z.string().nullable(),
  recordingEndedAt: z.string().nullable(),
  insights: z.record(z.any()).nullable(),
  chapters: z.array(z.record(z.any())).nullable(),
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
