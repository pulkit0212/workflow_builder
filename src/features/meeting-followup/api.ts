import type { MeetingSessionErrorResponse } from "@/features/meeting-assistant/types";
import type { MeetingFollowUpResponse } from "@/features/meeting-followup/types";

type GenerateMeetingFollowUpSuccess = {
  success: true;
  followUpEmail: string;
};

function getErrorMessage(payload: MeetingSessionErrorResponse) {
  return payload.message;
}

export async function generateMeetingFollowUp(meetingId: string) {
  const response = await fetch("/api/meeting/followup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      meetingId
    })
  });

  const payload = (await response.json()) as GenerateMeetingFollowUpSuccess | MeetingSessionErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getErrorMessage(payload) : "Failed to generate follow-up.");
  }

  return payload.followUpEmail as MeetingFollowUpResponse["followUpEmail"];
}
