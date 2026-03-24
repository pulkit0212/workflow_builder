import type {
  CreateMeetingSessionInput,
  MeetingSessionErrorResponse,
  MeetingSessionRecord,
  MeetingSessionResponse,
  UpdateMeetingSessionInput
} from "@/features/meeting-assistant/types";

function getSessionErrorMessage(payload: MeetingSessionErrorResponse) {
  if (
    payload.details &&
    typeof payload.details === "object" &&
    "fieldErrors" in payload.details &&
    payload.details.fieldErrors &&
    typeof payload.details.fieldErrors === "object"
  ) {
    const fieldErrors = payload.details.fieldErrors as Record<string, string[] | undefined>;
    const titleError = fieldErrors.title?.[0];
    const meetingLinkError = fieldErrors.meetingLink?.[0];

    if (titleError) {
      return titleError;
    }

    if (meetingLinkError) {
      return meetingLinkError;
    }
  }

  return payload.message;
}

export async function createMeetingSessionRecord(input: CreateMeetingSessionInput) {
  const response = await fetch("/api/meetings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const payload = (await response.json()) as MeetingSessionResponse | MeetingSessionErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getSessionErrorMessage(payload) : "Failed to create meeting session.");
  }

  return payload.session;
}

export async function updateMeetingSessionRecord(sessionId: string, input: UpdateMeetingSessionInput) {
  const response = await fetch(`/api/meetings/${sessionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const payload = (await response.json()) as MeetingSessionResponse | MeetingSessionErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getSessionErrorMessage(payload) : "Failed to update meeting session.");
  }

  return payload.session;
}
