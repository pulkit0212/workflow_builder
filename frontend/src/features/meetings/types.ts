import type { MeetingActionItem } from "@/features/tools/meeting-summarizer/types";
import type { MeetingSessionProvider } from "@/features/meeting-assistant/types";

export type MeetingDetailStatus =
  | "scheduled"
  | "joining"
  | "waiting_for_join"
  | "waiting_for_admission"
  | "joined"
  | "capturing"
  | "processing"
  | "summarizing"
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
  errorCode: string | null;
  failureReason: string | null;
  transcript: string | null;
  summary: string | null;
  keyDecisions: string[];
  risksAndBlockers: string[];
  keyTopics: string[];
  meetingSentiment: string | null;
  followUpNeeded: boolean | null;
  meetingDuration: number | null;
  keyPoints: string[];
  actionItems: MeetingActionItem[];
  recordingUrl: string | null;
  recordingSize: number | null;
  recordingDuration: number | null;
  insights: Record<string, unknown> | null;
  chapters: Array<Record<string, unknown>> | null;
  canJoinAndCapture: boolean;
  // Workspace sharing fields
  workspaceMoveStatus: string | null;
  workspaceId: string | null;
  isOwner: boolean;
};

export type MeetingDetailResponse = {
  success: true;
  meeting: MeetingDetailRecord;
};

export type MeetingStartResponse = {
  success: true;
  meeting: MeetingDetailRecord;
  status: "bot_starting" | "already_recording";
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
  errorCode: string | null;
  failureReason: string | null;
  recordingFilePath: string | null;
  recordingUrl: string | null;
  recordingDuration: number | null;
  recordingStartedAt: string | null;
  recordingEndedAt: string | null;
  transcript: string | null;
  summary: MeetingStructuredSummary | null;
  insights: Record<string, unknown> | null;
  chapters: Array<Record<string, unknown>> | null;
  updatedAt: string;
  platform: string;
  platformName: string;
};

export type MeetingStructuredSummary = {
  summary: string;
  key_points: string[];
  action_items: MeetingActionItem[];
};
