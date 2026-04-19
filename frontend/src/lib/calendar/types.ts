export type CalendarProvider = "google" | "microsoft_teams" | "microsoft_outlook";

export type UnifiedCalendarMeeting = {
  id: string;
  title: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  meetLink: string | null;
  provider: CalendarProvider;
  source: "google_calendar" | "microsoft_teams" | "microsoft_outlook";
};

export type CalendarFeedResponse = {
  meetings: UnifiedCalendarMeeting[];
  partialFailure?: {
    failedProviders: Array<{ provider: CalendarProvider; error: string }>;
  };
};

export interface CalendarClient {
  fetchMeetings(params: {
    accessToken: string;
    refreshToken: string | null;
    userId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<UnifiedCalendarMeeting[]>;
}
