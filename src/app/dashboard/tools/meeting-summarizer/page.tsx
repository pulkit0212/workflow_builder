import {
  resolveDefaultMeetingProvider,
  resolveDefaultTranscriptionProvider
} from "@/features/tools/meeting-summarizer/config";
import { MeetingSummarizerWorkspace } from "@/features/tools/meeting-summarizer/components/meeting-summarizer-workspace";

export default async function MeetingSummarizerPage() {
  const defaultProvider = resolveDefaultMeetingProvider(process.env.AI_PROVIDER ?? process.env.DEFAULT_AI_PROVIDER);
  const defaultTranscriptionProvider = resolveDefaultTranscriptionProvider(
    process.env.DEFAULT_TRANSCRIPTION_PROVIDER
  );

  return (
    <MeetingSummarizerWorkspace
      defaultProvider={defaultProvider}
      defaultTranscriptionProvider={defaultTranscriptionProvider}
    />
  );
}
