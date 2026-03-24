import { z } from "zod";

export const generateMeetingFollowUpSchema = z.object({
  meetingId: z.string().uuid("Invalid meeting id.")
});

export const meetingFollowUpResponseSchema = z.object({
  followUpEmail: z.string().trim().min(1, "Follow-up email is required.")
});
