import type { GoogleCalendarMeeting } from "@/lib/google/types";

export type GoogleIntegrationStatus = {
  provider: "google";
  connected: boolean;
  expiry: string | null;
};

export type GoogleIntegrationResponse = {
  success: true;
  integration: GoogleIntegrationStatus;
};

export type GoogleCalendarResponse = {
  success: true;
  meetings: GoogleCalendarMeeting[];
};

export type IntegrationErrorResponse = {
  success: false;
  message: string;
  details?: unknown;
};
