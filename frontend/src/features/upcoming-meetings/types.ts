import type { GoogleCalendarMeeting } from "@/lib/google/types";

export type UpcomingMeeting = GoogleCalendarMeeting;

export type UpcomingMeetingStatus = "upcoming" | "starting_soon" | "ongoing" | "completed";
