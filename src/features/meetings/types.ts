import type { MeetingActionItem } from "@/features/tools/meeting-summarizer/types";
import type { MeetingSessionProvider } from "@/features/meeting-assistant/types";

export type MeetingDetailStatus =
  | "scheduled"
  | "joining"
  | "waiting_for_join"
  | "joined"
  | "capturing"
  | "processing"
  | "completed"
  | "failed";

export type MeetingDetailRecord = {
  id: string;
  meetingSessionId: string | null;
  calendarEventId: string | null;
  source: "google_calendar" | "app";
  title: string;
  meetingLink: string;
  provider: MeetingSessionProvider;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  captureSessionId: string | null;
  captureStartedAt: string | null;
  captureEndedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  status: MeetingDetailStatus;
  transcript: string | null;
  summary: string | null;
  keyPoints: string[];
  actionItems: MeetingActionItem[];
  canJoinAndCapture: boolean;
};

export type MeetingDetailResponse = {
  success: true;
  meeting: MeetingDetailRecord;
};

export type MeetingStartResponse = {
  success: true;
  meeting: MeetingDetailRecord;
  status: "bot_starting";
  message: string;
};

export type MeetingStopResponse = {
  success: true;
  meeting: MeetingDetailRecord;
};

export type MeetingStatusResponse = {
  success: true;
  meetingId: string;
  state: MeetingDetailStatus;
  transcript: string | null;
  summary:
    | {
        summary: string;
        action_items: string[];
        decisions: string[];
      }
    | null;
  updatedAt: string;
};
