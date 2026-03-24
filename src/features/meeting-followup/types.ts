import type { z } from "zod";
import {
  generateMeetingFollowUpSchema,
  meetingFollowUpResponseSchema
} from "@/features/meeting-followup/schema";

export type GenerateMeetingFollowUpInput = z.infer<typeof generateMeetingFollowUpSchema>;
export type MeetingFollowUpResponse = z.infer<typeof meetingFollowUpResponseSchema>;
