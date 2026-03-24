import { z } from "zod";

export const sendMeetingEmailSchema = z.object({
  meetingId: z.string().uuid("Invalid meeting id."),
  recipients: z.array(z.string().trim().email("Enter a valid recipient email.")).min(1, "Add at least one recipient.")
});
