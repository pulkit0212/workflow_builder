import type {
  MeetingSessionErrorResponse,
  MeetingSessionListResponse,
  MeetingSessionResponse
} from "@/features/meeting-assistant/types";
import type { GoogleCalendarMeeting } from "@/lib/google/types";
import type {
  MeetingDetailResponse,
  MeetingStartResponse,
  MeetingStatusResponse,
  MeetingStopResponse
} from "@/features/meetings/types";

function getMeetingsErrorMessage(payload: MeetingSessionErrorResponse) {
  return payload.message;
}

export type TodayMeetingsResult =
  | {
      status: "connected";
      meetings: GoogleCalendarMeeting[];
    }
  | {
      status: "not_connected";
      meetings: GoogleCalendarMeeting[];
      message: string;
    };

export async function fetchMeetings() {
  const response = await fetch("/api/meetings", {
    cache: "no-store"
  });
  const payload = (await response.json()) as MeetingSessionListResponse | MeetingSessionErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getMeetingsErrorMessage(payload) : "Failed to load meetings.");
  }

  return payload.meetings;
}

export async function fetchTodayMeetings() {
  const response = await fetch("/api/meetings/today", {
    cache: "no-store"
  });
  const payload = (await response.json()) as GoogleCalendarMeeting[] | MeetingSessionErrorResponse;

  if (
    response.ok &&
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "message" in payload &&
    payload.message === "Google account not connected"
  ) {
    return {
      status: "not_connected",
      meetings: [],
      message: payload.message
    };
  }

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "message" in payload
        ? getMeetingsErrorMessage(payload)
        : "Failed to load today's meetings."
    );
  }

  return {
    status: "connected",
    meetings: Array.isArray(payload) ? payload : []
  };
}

export async function fetchJoinedMeetings() {
  const response = await fetch("/api/meetings/joined", {
    cache: "no-store"
  });
  const payload = (await response.json()) as MeetingSessionListResponse | MeetingSessionErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getMeetingsErrorMessage(payload) : "Failed to load joined meetings.");
  }

  return payload.meetings;
}

export async function fetchMeetingById(id: string) {
  const response = await fetch(`/api/meetings/${id}`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as MeetingDetailResponse | MeetingSessionErrorResponse;

  if (!response.ok || !payload.success) {
    const error = new Error("message" in payload ? getMeetingsErrorMessage(payload) : "Failed to load meeting.");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload.meeting;
}

export async function startMeetingCapture(id: string, meetingUrl: string) {
  const response = await fetch(`/api/meetings/${id}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      meetingUrl
    })
  });
  const payload = (await response.json()) as MeetingStartResponse | MeetingSessionErrorResponse;

  if (!response.ok || !payload.success) {
    const error = new Error(
      !payload.success ? getMeetingsErrorMessage(payload) : "Failed to start meeting capture."
    );
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload;
}

export async function stopMeetingCapture(id: string) {
  const response = await fetch(`/api/meetings/${id}/stop`, {
    method: "POST"
  });
  const payload = (await response.json()) as MeetingStopResponse | MeetingSessionErrorResponse;

  if (!response.ok || !payload.success) {
    const error = new Error("message" in payload ? getMeetingsErrorMessage(payload) : "Failed to stop meeting capture.");
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload.meeting;
}

export async function fetchMeetingStatus(id: string) {
  const response = await fetch(`/api/meetings/${id}/status`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as MeetingStatusResponse | MeetingSessionErrorResponse;

  if (!response.ok || !payload.success) {
    const error = new Error(
      "message" in payload ? getMeetingsErrorMessage(payload) : "Failed to load meeting status."
    );
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return payload;
}
