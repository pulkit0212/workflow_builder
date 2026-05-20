export type GoogleCalendarMeeting = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  meetLink: string | null;
  provider: "google_meet" | "zoom_web" | "teams_web";
  source: "google_calendar";
};
