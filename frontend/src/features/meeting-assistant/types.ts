import type { z } from "zod";
import {
  createMeetingSessionSchema,
  meetingAssistantPrefillSchema,
  meetingSessionProviderSchema,
  meetingSessionRecordSchema,
  meetingSessionStatusSchema,
  updateMeetingSessionSchema
} from "@/features/meeting-assistant/schema";

export type MeetingSessionProvider = z.infer<typeof meetingSessionProviderSchema>;
export type MeetingAssistantPrefill = z.infer<typeof meetingAssistantPrefillSchema>;
export type MeetingSessionStatus = z.infer<typeof meetingSessionStatusSchema>;
export type CreateMeetingSessionInput = z.infer<typeof createMeetingSessionSchema>;
export type UpdateMeetingSessionInput = z.infer<typeof updateMeetingSessionSchema>;
export type MeetingSessionRecord = z.infer<typeof meetingSessionRecordSchema>;

export type MeetingSessionResponse = {
  success: true;
  session: MeetingSessionRecord;
};

export type MeetingSessionListResponse = {
  success: true;
  meetings: MeetingSessionRecord[];
};

export type MeetingSessionErrorResponse = {
  success: false;
  message: string;
  details?: unknown;
};
