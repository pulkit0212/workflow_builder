type BotStatus = "waiting_for_join" | "capturing" | "processing" | "completed" | "failed";

type BotStartResult = {
  success: boolean;
  outputPath?: string;
  error?: string;
};

type BotStopResult = {
  success: boolean;
  transcript?: string;
  summary?: {
    summary?: string;
    action_items?: string[];
    decisions?: string[];
    key_topics?: string[];
  };
  error?: string;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const botModule = require("../../bot");

export function startBot(
  meetingId: string,
  meetingUrl: string,
  onStatusUpdate: (meetingId: string, status: BotStatus) => Promise<void>
): Promise<BotStartResult> {
  return botModule.startBot(meetingId, meetingUrl, onStatusUpdate);
}

export function stopBot(
  meetingId: string,
  onStatusUpdate: (meetingId: string, status: BotStatus) => Promise<void>
): Promise<BotStopResult> {
  return botModule.stopBot(meetingId, onStatusUpdate);
}
