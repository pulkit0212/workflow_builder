/**
 * Shared meeting status logic for dashboard and meetings list.
 * Priority 1: bot session state (if session exists)
 * Priority 2: calendar time-based state (no session)
 */

import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { GoogleCalendarMeeting } from "@/lib/google/types";

// Structural type covering both GoogleCalendarMeeting and UnifiedCalendarMeeting
type CalendarMeetingLike = Pick<GoogleCalendarMeeting, "id" | "title" | "startTime" | "endTime" | "meetLink">;

export type MeetingDisplayStatus = {
  label: string;
  color: string;
  bg: string;
  pulse: boolean;
  showStartNotetaker: boolean;
  showStopRecording: boolean;
  showViewReport: boolean;
  showJoin: boolean;
};

export function getMeetingDisplayStatus(
  meeting: CalendarMeetingLike,
  session: MeetingSessionRecord | null | undefined
): MeetingDisplayStatus {
  // PRIORITY 1: bot session exists — use session state
  if (session) {
    switch (session.status) {
      case "completed":
        return {
          label: "Completed",
          color: "#16a34a",
          bg: "#f0fdf4",
          pulse: false,
          showStartNotetaker: false,
          showStopRecording: false,
          showViewReport: true,
          showJoin: false,
        };
      case "capturing":
        return {
          label: "Recording",
          color: "#dc2626",
          bg: "#fef2f2",
          pulse: true,
          showStartNotetaker: false,
          showStopRecording: true,
          showViewReport: false,
          showJoin: false,
        };
      case "processing":
      case "summarizing":
        return {
          label: "Processing",
          color: "#2563eb",
          bg: "#eff6ff",
          pulse: false,
          showStartNotetaker: false,
          showStopRecording: false,
          showViewReport: false,
          showJoin: false,
        };
      case "waiting_for_join":
      case "waiting_for_admission":
        return {
          label: "Bot Joining",
          color: "#ca8a04",
          bg: "#fefce8",
          pulse: true,
          showStartNotetaker: false,
          showStopRecording: false,
          showViewReport: false,
          showJoin: false,
        };
      case "failed":
        return {
          label: "Failed",
          color: "#dc2626",
          bg: "#fef2f2",
          pulse: false,
          showStartNotetaker: true,
          showStopRecording: false,
          showViewReport: false,
          showJoin: true,
        };
    }
  }

  // PRIORITY 2: no session — use calendar time
  const now = new Date();
  const startTime = new Date(meeting.startTime);
  const endTime = new Date(meeting.endTime);
  const preJoinTime = new Date(startTime.getTime() - 15 * 60 * 1000);

  // More than 15 min before start
  if (now < preJoinTime) {
    return {
      label: "Upcoming",
      color: "#6b7280",
      bg: "#f3f4f6",
      pulse: false,
      showStartNotetaker: false,
      showStopRecording: false,
      showViewReport: false,
      showJoin: false,
    };
  }

  // Within 15 min window or currently live
  if (now >= preJoinTime && now <= endTime) {
    const isLive = now >= startTime;
    return {
      label: isLive ? "Live Now" : "Starting Soon",
      color: "#dc2626",
      bg: "#fef2f2",
      pulse: isLive,
      showStartNotetaker: true,
      showStopRecording: false,
      showViewReport: false,
      showJoin: true,
    };
  }

  // Meeting time has passed — no recording was made
  if (now > endTime) {
    return {
      label: "Ended",
      color: "#6b7280",
      bg: "#f3f4f6",
      pulse: false,
      showStartNotetaker: false,
      showStopRecording: false,
      showViewReport: false,
      showJoin: false,
    };
  }

  // Default fallback
  return {
    label: "Scheduled",
    color: "#6b7280",
    bg: "#f3f4f6",
    pulse: false,
    showStartNotetaker: false,
    showStopRecording: false,
    showViewReport: false,
    showJoin: false,
  };
}

/**
 * Find the most recent session for a calendar meeting.
 * Matches by externalCalendarEventId first, then by meetingLink URL.
 */
export function findSessionForMeeting(
  meeting: CalendarMeetingLike,
  sessions: MeetingSessionRecord[]
): MeetingSessionRecord | null {
  // Match by calendar event ID (most reliable)
  const byEventId = sessions.find(
    (s) => s.externalCalendarEventId === meeting.id
  );
  if (byEventId) return byEventId;

  // Match by meeting link URL
  if (meeting.meetLink) {
    const meetLinkNorm = meeting.meetLink.toLowerCase().replace(/\/$/, "");
    const byLink = sessions.find((s) => {
      const sessionLink = s.meetingLink?.toLowerCase().replace(/\/$/, "") ?? "";
      return sessionLink === meetLinkNorm || sessionLink.includes(meetLinkNorm) || meetLinkNorm.includes(sessionLink);
    });
    if (byLink) return byLink;
  }

  return null;
}
