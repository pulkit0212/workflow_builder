import {
  resolveDefaultMeetingProvider,
  resolveDefaultTranscriptionProvider
} from "@/features/tools/meeting-summarizer/config";
import { MeetingSummarizerWorkspace } from "@/features/tools/meeting-summarizer/components/meeting-summarizer-workspace";
import { ToolPageShell } from "@/components/tools/tool-page-shell";
import { toolRegistry } from "@/lib/ai/tool-registry";

export default async function MeetingSummarizerPage() {
  const defaultProvider = resolveDefaultMeetingProvider(process.env.AI_PROVIDER ?? process.env.DEFAULT_AI_PROVIDER);
  const defaultTranscriptionProvider = resolveDefaultTranscriptionProvider(
    process.env.DEFAULT_TRANSCRIPTION_PROVIDER
  );

  return (
    <ToolPageShell
      tool={toolRegistry["meeting-summarizer"]}
      ctaButton={
        <button
          form="meeting-summarizer-form"
          type="submit"
          className="inline-flex items-center gap-2 rounded-xl bg-[#6C3FF5] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#5B2FE0] transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
          Generate Summary
        </button>
      }
    >
      <MeetingSummarizerWorkspace
        defaultProvider={defaultProvider}
        defaultTranscriptionProvider={defaultTranscriptionProvider}
      />
    </ToolPageShell>
  );
}
