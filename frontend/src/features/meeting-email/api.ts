import { clientApiFetch } from "@/lib/api-client";
import type { MeetingSessionErrorResponse } from "@/features/meeting-assistant/types";

type SendMeetingEmailResponse = {
  success: true;
  emailSentAt: string;
};

function getErrorMessage(payload: MeetingSessionErrorResponse) {
  return payload.message;
}

export async function sendMeetingEmail(meetingId: string, recipients: string[]) {
  const response = await clientApiFetch("/api/meeting/send-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      meetingId,
      recipients
    })
  });

  const payload = (await response.json()) as SendMeetingEmailResponse | MeetingSessionErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getErrorMessage(payload) : "Failed to send meeting email.");
  }

  return payload.emailSentAt;
}
