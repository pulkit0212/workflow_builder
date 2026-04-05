import type { GoogleCalendarMeeting } from "@/lib/google/types";
import type {
  GoogleCalendarResponse,
  GoogleIntegrationResponse,
  GoogleIntegrationStatus,
  IntegrationErrorResponse
} from "@/features/integrations/types";

function getErrorMessage(payload: IntegrationErrorResponse) {
  return payload.message;
}

export async function fetchGoogleIntegrationStatus() {
  const response = await fetch("/api/google/integration", {
    cache: "no-store"
  });
  const payload = (await response.json()) as GoogleIntegrationResponse | IntegrationErrorResponse;

  if (!response.ok || !payload.success) {
    throw new Error("message" in payload ? getErrorMessage(payload) : "Failed to load Google integration.");
  }

  return payload.integration;
}

export async function disconnectGoogleIntegration() {
  const response = await fetch("/api/google/integration", {
    method: "DELETE"
  });
  const payload = (await response.json()) as { success: true } | IntegrationErrorResponse;

  if (!response.ok || !("success" in payload && payload.success)) {
    throw new Error("message" in payload ? getErrorMessage(payload) : "Failed to disconnect Google.");
  }
}

export async function fetchGoogleCalendarMeetings() {
  const response = await fetch("/api/google/calendar", {
    cache: "no-store"
  });
  const payload = (await response.json()) as GoogleCalendarResponse | IntegrationErrorResponse;

  if (!response.ok || !payload.success) {
    const error = new Error("message" in payload ? getErrorMessage(payload) : "Failed to load calendar meetings.") as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }

  return payload.meetings;
}
