export type GoogleCalendarMeeting = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  meetLink: string | null;
  provider: "google_meet";
  source: "google_calendar";
};
