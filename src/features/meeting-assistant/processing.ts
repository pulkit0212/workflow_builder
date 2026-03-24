import { updateMeetingSessionRecord } from "@/features/meeting-assistant/api";
import { normalizeMeetingActionItems } from "@/features/meeting-assistant/helpers";
import { runMeetingSummarizer, type ToolRunResponse } from "@/features/tools/meeting-summarizer/api";
import type {
  MeetingAiProvider,
  MeetingSummarizerOutput,
  MeetingTranscriptionProvider
} from "@/features/tools/meeting-summarizer/types";

type SummarizeMeetingSessionTranscriptInput = {
  sessionId: string;
  title: string;
  meetingLink: string;
  notes: string;
  transcript: string;
  provider: MeetingAiProvider;
  transcriptionProvider?: MeetingTranscriptionProvider;
};

export async function summarizeMeetingSessionTranscript(
  input: SummarizeMeetingSessionTranscriptInput
): Promise<{
  session: Awaited<ReturnType<typeof updateMeetingSessionRecord>>;
  run: ToolRunResponse<MeetingSummarizerOutput>["run"];
}> {
  const response = await runMeetingSummarizer({
    inputType: "transcript",
    provider: input.provider,
    transcriptionProvider: input.transcriptionProvider,
    originalTranscript: input.transcript,
    transcript: input.transcript
  });

  const session = await updateMeetingSessionRecord(input.sessionId, {
    title: input.title,
    meetingLink: input.meetingLink,
    notes: input.notes,
    transcript: input.transcript,
    summary: response.run.outputJson.summary,
    keyPoints: response.run.outputJson.key_points,
    actionItems: normalizeMeetingActionItems(response.run.outputJson.action_items),
    aiRunId: response.run.id,
    status: "completed"
  });

  return {
    session,
    run: response.run
  };
}
