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
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";

function getMeetingsErrorMessage(payload: MeetingSessionErrorResponse) {
  return payload.message;
}

export type TodayMeetingsResult =
  | {
      status: "connected";
      meetings: GoogleCalendarMeeting[];
    }
  | {
      status: "auth_required";
      meetings: GoogleCalendarMeeting[];
      message: string;
    }
  | {
      status: "not_connected";
      meetings: GoogleCalendarMeeting[];
      message: string;
    };

export type ReportsResponse = {
  meetings: MeetingSessionRecord[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export async function fetchBotProfileStatus() {
  const response = await fetch("/api/bot/profile-status", {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to load Artiva bot profile status.");
  }

  return (await response.json()) as {
    configured: boolean;
  };
}

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
    "error" in payload &&
    payload.error === "calendar_auth_required"
  ) {
    return {
      status: "auth_required",
      meetings: [],
      message: payload.message
    };
  }

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

export async function fetchUpcomingMeetings() {
  const response = await fetch("/api/meetings/upcoming", {
    cache: "no-store"
  });
  const payload = (await response.json()) as GoogleCalendarMeeting[] | MeetingSessionErrorResponse;

  if (
    response.ok &&
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "error" in payload &&
    payload.error === "calendar_auth_required"
  ) {
    return [];
  }

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "message" in payload
        ? getMeetingsErrorMessage(payload)
        : "Failed to load upcoming meetings."
    );
  }

  return Array.isArray(payload) ? payload : [];
}

export async function fetchMeetingReports(params: {
  page: number;
  limit: number;
  status: "all" | "completed" | "recording" | "failed";
  date: "all" | "week" | "month";
  search: string;
}) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    status: params.status,
    date: params.date,
    search: params.search
  });
  const response = await fetch(`/api/meetings/reports?${query.toString()}`, {
    cache: "no-store"
  });
  const payload = (await response.json()) as ReportsResponse | MeetingSessionErrorResponse;

  if (!response.ok) {
    const error = new Error("message" in payload ? getMeetingsErrorMessage(payload) : "Failed to load meeting reports.");
    (error as Error & { status?: number; code?: string }).status = response.status;
    if (payload && typeof payload === "object" && "details" in payload && payload.details && typeof payload.details === "object") {
      const details = payload.details as { error?: string };
      if (details.error) {
        (error as Error & { code?: string }).code = details.error;
      }
    }
    throw error;
  }

  return payload as ReportsResponse;
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
    if (payload && typeof payload === "object" && "details" in payload && payload.details && typeof payload.details === "object") {
      const details = payload.details as { error?: string };
      if (details.error) {
        (error as Error & { code?: string }).code = details.error;
      }
    }
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
