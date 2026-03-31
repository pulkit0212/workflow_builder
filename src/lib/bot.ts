type BotStatus =
  | "waiting_for_join"
  | "waiting_for_admission"
  | "capturing"
  | "processing"
  | "summarizing"
  | "completed"
  | "failed";

type BotStartResult = {
  success: boolean;
  outputPath?: string;
  error?: string;
};

type BotStopResult = {
  success: boolean;
  transcript?: string;
  meetingDurationSeconds?: number;
  outputPath?: string;
  summary?: {
    summary?: string;
    key_decisions?: string[];
    action_items?: Array<{
      task: string;
      owner: string;
      due_date: string;
      priority: "High" | "Medium" | "Low";
    }>;
    risks_and_blockers?: string[];
    key_topics?: string[];
    meeting_sentiment?: string;
    follow_up_meeting_needed?: boolean;
  };
  error?: string;
  errorCode?: string;
};

type BotStatusPayload = {
  errorCode?: string | null;
  failureReason?: string | null;
  recordingFilePath?: string | null;
  recordingStartedAt?: string | null;
  recordingEndedAt?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const botModule = require("../../bot");

export function startBot(
  meetingId: string,
  meetingUrl: string,
  onStatusUpdate: (meetingId: string, status: BotStatus, payload?: BotStatusPayload) => Promise<void>
): Promise<BotStartResult> {
  return botModule.startBot(meetingId, meetingUrl, onStatusUpdate);
}

export function stopBot(
  meetingId: string,
  onStatusUpdate: (meetingId: string, status: BotStatus, payload?: BotStatusPayload) => Promise<void>
): Promise<BotStopResult> {
  return botModule.stopBot(meetingId, onStatusUpdate);
}
