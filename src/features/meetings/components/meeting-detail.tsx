"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckSquare,
  ExternalLink,
  Link2,
  LoaderCircle,
  MessageSquareText,
  Mic,
  Sparkles,
  Square,
  TriangleAlert
} from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { ResultState } from "@/components/tools/result-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { copyTextToClipboard, getMeetingSessionProviderLabel } from "@/features/meeting-assistant/helpers";
import { fetchMeetingById, startMeetingCapture, stopMeetingCapture } from "@/features/meetings/api";
import { formatMeetingDate, formatMeetingDuration, formatMeetingTime, getMeetingDetailStatusBadgeVariant, getMeetingDetailStatusLabel, hasProcessedMeetingContent } from "@/features/meetings/helpers";
import type { MeetingDetailRecord } from "@/features/meetings/types";
import { useSessionPolling } from "@/hooks/useSessionPolling";
import { cn } from "@/lib/utils";

type MeetingDetailProps = {
  meetingId: string;
};

type DetailTab = "notes" | "transcript" | "insights";

type TranscriptBlock = {
  speaker: string;
  text: string;
  timestamp: string;
  order: number;
  wordCount: number;
};

const tabs: Array<{ id: DetailTab; label: string }> = [
  { id: "notes", label: "Notes" },
  { id: "transcript", label: "Transcript" },
  { id: "insights", label: "Insights" }
];

function MeetingDetailSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((index) => (
        <Card key={index} className="p-6">
          <div className="space-y-4">
            <div className="shimmer h-4 w-28 rounded-full" />
            <div className="shimmer h-8 w-64 rounded-xl" />
            <div className="shimmer h-28 rounded-xl" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function getStatusMessage(status: MeetingDetailRecord["status"]) {
  switch (status) {
    case "waiting_for_join":
      return "Preparing to join Google Meet in a separate browser.";
    case "waiting_for_admission":
      return "Waiting for the meeting host to admit the Artiva bot.";
    case "capturing":
      return "Recording in progress. Audio is being captured for transcription.";
    case "processing":
      return "Processing the saved recording and preparing the transcript.";
    case "summarizing":
      return "Generating the structured Artiva summary and action items.";
    case "failed":
      return "The last recording run failed before the report finished.";
    case "completed":
      return "Meeting report is ready.";
    default:
      return "Scheduled and ready to start.";
  }
}

function getFailureMessage(errorCode: string | null, fallback: string | null) {
  const errorMessages: Record<string, string> = {
    meet_access_denied: "Bot profile not set up. Run: npm run setup:bot-profile in your terminal.",
    invalid_meeting_link: "The meeting link is invalid or the meeting has ended.",
    no_audio_captured: "No audio was captured. Check MEETING_AUDIO_SOURCE in your .env.local file.",
    transcription_failed: "Transcription failed. The audio may be too short or corrupted.",
    summary_failed: "Summary generation failed. The transcript may be empty.",
    host_admission_required: "Bot is waiting to be admitted by the meeting host.",
    default: "An unexpected error occurred. Check the server logs."
  };

  if (errorCode && errorMessages[errorCode]) {
    return errorMessages[errorCode];
  }

  return fallback || errorMessages.default;
}

function formatOffset(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() || "")
    .join("");
}

function parseTranscriptBlocks(transcript: string | null, durationSeconds: number | null) {
  if (!transcript?.trim()) {
    return [] as TranscriptBlock[];
  }

  const paragraphs = transcript
    .split(/\n\s*\n/)
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const speakerRegex = /^([A-Z][A-Za-z.' -]{1,40}):\s*(.+)$/;
  const estimatedDuration = durationSeconds && durationSeconds > 0 ? durationSeconds : Math.max(60, paragraphs.length * 45);
  let fallbackSpeaker = "Speaker 1";

  return paragraphs.map((paragraph, index) => {
    const match = paragraph.match(speakerRegex);
    const speaker = match?.[1]?.trim() || fallbackSpeaker;
    const text = match?.[2]?.trim() || paragraph;

    if (!match && index > 0) {
      fallbackSpeaker = `Speaker ${Math.min(index + 1, 6)}`;
    }

    return {
      speaker,
      text,
      order: index,
      timestamp: formatOffset(Math.round((estimatedDuration / Math.max(paragraphs.length, 1)) * index)),
      wordCount: text.split(/\s+/).filter(Boolean).length
    };
  });
}

function getPriorityTone(priority: string | null | undefined) {
  switch ((priority || "Medium").toLowerCase()) {
    case "high":
      return "bg-[#fef2f2] text-[#dc2626]";
    case "low":
      return "bg-[#f0fdf4] text-[#16a34a]";
    default:
      return "bg-[#fefce8] text-[#ca8a04]";
  }
}

function renderStatusBadge(status: MeetingDetailRecord["status"]) {
  return (
    <Badge variant={getMeetingDetailStatusBadgeVariant(status)}>
      {status === "capturing" ? <span className="pulse-dot" aria-hidden="true" /> : null}
      {getMeetingDetailStatusLabel(status)}
    </Badge>
  );
}

export function MeetingDetail({ meetingId }: MeetingDetailProps) {
  const [meeting, setMeeting] = useState<MeetingDetailRecord | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("notes");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const session = useSessionPolling(meeting?.meetingSessionId ?? null);

  useEffect(() => {
    let isMounted = true;

    async function loadMeeting() {
      setIsLoading(true);
      setError(null);
      setNotFound(false);

      try {
        const nextMeeting = await fetchMeetingById(meetingId);
        if (isMounted) {
          setMeeting(nextMeeting);
        }
      } catch (loadError) {
        const errorWithStatus = loadError as Error & { status?: number };

        if (!isMounted) {
          return;
        }

        if (errorWithStatus.status === 404 || errorWithStatus.status === 403) {
          setNotFound(true);
        } else {
          setError(loadError instanceof Error ? loadError.message : "Failed to load meeting.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadMeeting();

    return () => {
      isMounted = false;
    };
  }, [meetingId]);

  useEffect(() => {
    if (!session) {
      return;
    }

    setMeeting((currentMeeting) =>
      currentMeeting
        ? {
            ...currentMeeting,
            status: session.state,
            errorCode: session.errorCode ?? currentMeeting.errorCode,
            failureReason: session.failureReason ?? currentMeeting.failureReason,
            captureStartedAt: session.recordingStartedAt ?? currentMeeting.captureStartedAt,
            captureEndedAt: session.recordingEndedAt ?? currentMeeting.captureEndedAt,
            transcript: session.transcript ?? currentMeeting.transcript
          }
        : currentMeeting
    );

    if (session.state === "completed" || session.state === "failed") {
      void fetchMeetingById(meetingId)
        .then((nextMeeting) => {
          setMeeting(nextMeeting);
          setActionError(null);
          setCopyFeedback(null);
        })
        .catch(() => null);
    }
  }, [meetingId, session]);

  const transcriptBlocks = useMemo(
    () => parseTranscriptBlocks(meeting?.transcript ?? null, meeting?.meetingDuration ?? null),
    [meeting?.meetingDuration, meeting?.transcript]
  );

  const speakerStats = useMemo(() => {
    const counts = new Map<string, number>();

    for (const block of transcriptBlocks) {
      counts.set(block.speaker, (counts.get(block.speaker) || 0) + block.wordCount);
    }

    const totalWords = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);

    return Array.from(counts.entries())
      .map(([speaker, words]) => ({
        speaker,
        words,
        percentage: totalWords > 0 ? Math.max(5, Math.round((words / totalWords) * 100)) : 0
      }))
      .sort((left, right) => right.words - left.words);
  }, [transcriptBlocks]);

  const ownerNames = meeting?.actionItems.map((item) => item.owner).filter(Boolean) ?? [];
  const participantCount = Math.max(speakerStats.length, new Set(ownerNames).size, meeting?.transcript ? 1 : 0);
  const showProcessedResults =
    meeting?.status === "completed" ||
    meeting?.status === "processing" ||
    hasProcessedMeetingContent(meeting ?? { transcript: null, summary: null, keyPoints: [], actionItems: [] }) ||
    (!!meeting && meeting.status === "failed" && hasProcessedMeetingContent(meeting));
  const failureMessage = getFailureMessage(meeting?.errorCode ?? null, meeting?.failureReason || actionError);
  const canStartBot =
    meeting?.canJoinAndCapture &&
    meeting?.status !== "waiting_for_join" &&
    meeting?.status !== "waiting_for_admission" &&
    meeting?.status !== "capturing" &&
    meeting?.status !== "processing" &&
    meeting?.status !== "summarizing" &&
    meeting?.status !== "completed";
  const canStopBot =
    meeting?.status === "waiting_for_join" ||
    meeting?.status === "waiting_for_admission" ||
    meeting?.status === "capturing";

  function handleStartBot() {
    if (!meeting?.meetingLink) {
      setActionError("This meeting does not have a valid meeting link.");
      return;
    }

    setActionError(null);

    startTransition(async () => {
      try {
        const started = await startMeetingCapture(meeting.id, meeting.meetingLink);
        setMeeting(started.meeting);
      } catch (startError) {
        setActionError(startError instanceof Error ? startError.message : "Failed to start recording.");
      }
    });
  }

  function handleStopBot() {
    const targetMeetingId = meeting?.meetingSessionId ?? meetingId;

    startTransition(async () => {
      try {
        const stoppedMeeting = await stopMeetingCapture(targetMeetingId);
        setMeeting(stoppedMeeting);
      } catch (stopError) {
        setActionError(stopError instanceof Error ? stopError.message : "Failed to stop recording.");
      }
    });
  }

  function handleOpenMeetingLink() {
    if (!meeting?.meetingLink) {
      setActionError("Meeting link is unavailable for this event.");
      return;
    }

    const openedTab = window.open(meeting.meetingLink, "_blank", "noopener,noreferrer");
    if (!openedTab) {
      setActionError("Unable to open the meeting link. Allow pop-ups for this site and try again.");
      return;
    }

    setActionError(null);
  }

  async function handleCopyActionItemsAsText() {
    if (!meeting || meeting.actionItems.length === 0) {
      setCopyFeedback("No action items are available to copy.");
      return;
    }

    const text = meeting.actionItems
      .map(
        (item, index) =>
          `${index + 1}. ${item.task} — ${item.owner || "Unassigned"} (Due: ${item.dueDate || item.deadline || "Not specified"})`
      )
      .join("\n");

    try {
      await copyTextToClipboard(text);
      setCopyFeedback("Action items copied as text.");
    } catch (copyError) {
      setCopyFeedback(copyError instanceof Error ? copyError.message : "Failed to copy action items.");
    }
  }

  async function handleCopyActionItemsAsMarkdown() {
    if (!meeting || meeting.actionItems.length === 0) {
      setCopyFeedback("No action items are available to copy.");
      return;
    }

    const markdown = [
      `## Action Items — ${meeting.title}`,
      ...meeting.actionItems.map(
        (item) =>
          `- [ ] ${item.task} — ${item.owner || "Unassigned"} (Due: ${item.dueDate || item.deadline || "Not specified"})`
      )
    ].join("\n");

    try {
      await copyTextToClipboard(markdown);
      setCopyFeedback("Action items copied as markdown.");
    } catch (copyError) {
      setCopyFeedback(copyError instanceof Error ? copyError.message : "Failed to copy action items.");
    }
  }

  if (isLoading) {
    return <MeetingDetailSkeleton />;
  }

  if (notFound) {
    return (
      <ResultState
        title="Meeting not found"
        description="From meetings to meaningful work. This meeting is unavailable or you no longer have access to it."
      >
        <Button asChild variant="secondary">
          <Link href="/dashboard/meetings">Back to meetings</Link>
        </Button>
      </ResultState>
    );
  }

  if (error || !meeting) {
    return (
      <ResultState
        icon="error"
        title="Unable to load meeting"
        description={error || "From meetings to meaningful work. An unexpected error occurred while loading this meeting."}
      >
        <Button asChild variant="secondary">
          <Link href="/dashboard/meetings">Back to meetings</Link>
        </Button>
      </ResultState>
    );
  }

  const engagementScore = Math.min(
    96,
    58 + speakerStats.length * 10 + (meeting.actionItems.length > 0 ? 8 : 0) + (meeting.keyDecisions.length > 0 ? 8 : 0)
  );
  const engagementLabel = engagementScore >= 80 ? "Good" : engagementScore >= 65 ? "Fair" : "Poor";
  const durationLabel = formatMeetingDuration(meeting.meetingDuration);
  const topicTimeline = meeting.keyTopics.map((topic, index) => ({
    topic,
    timestamp: formatOffset(
      Math.round(((meeting.meetingDuration || Math.max(meeting.keyTopics.length * 60, 60)) / Math.max(meeting.keyTopics.length, 1)) * index)
    )
  }));

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Artiva"
        title={meeting.title}
        description="From meetings to meaningful work."
        action={
          <Button asChild variant="ghost">
            <Link href="/dashboard/meetings">
              <ArrowLeft className="h-4 w-4" />
              Back to meetings
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2 rounded-xl border border-[#e5e7eb] bg-white p-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium text-[#6b7280] transition-colors hover:bg-[#f9fafb] hover:text-[#111827]",
              activeTab === tab.id && "bg-[#6c63ff] text-white hover:bg-[#6c63ff] hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {renderStatusBadge(meeting.status)}
              <Badge variant="neutral">{getMeetingSessionProviderLabel(meeting.provider)}</Badge>
            </div>
            <div>
              <h1>{meeting.title}</h1>
              <p className="mt-2 text-[14px] leading-6 text-[#4b5563]">
                {meeting.scheduledStartTime
                  ? `${formatMeetingDate(meeting.scheduledStartTime)} at ${formatMeetingTime(meeting.scheduledStartTime)}`
                  : "Schedule unavailable"}
                {durationLabel ? ` · ${durationLabel}` : ""}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
            <div className="rounded-xl bg-[#f9fafb] p-4">
              <p className="text-caption">Participants</p>
              <p className="mt-1 font-semibold text-[#111827]">{participantCount || "Unknown"}</p>
            </div>
            <div className="rounded-xl bg-[#f9fafb] p-4">
              <p className="text-caption">Platform</p>
              <p className="mt-1 font-semibold text-[#111827]">{getMeetingSessionProviderLabel(meeting.provider)}</p>
            </div>
          </div>
        </div>
      </Card>

      {activeTab === "notes" ? (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {renderStatusBadge(meeting.status)}
                  <span className="text-caption">AI Notetaker</span>
                </div>
                <h2>AI Notetaker control</h2>
                <p>{getStatusMessage(meeting.status)}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="ghost" onClick={handleOpenMeetingLink}>
                  <Link2 className="h-4 w-4" />
                  Open meeting
                  <ExternalLink className="h-4 w-4" />
                </Button>
                {canStartBot ? (
                  <Button type="button" onClick={handleStartBot} disabled={isPending}>
                    {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                    Start AI Notetaker
                  </Button>
                ) : canStopBot ? (
                  <Button type="button" variant="danger" onClick={handleStopBot} disabled={isPending}>
                    {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                    Stop Recording
                  </Button>
                ) : null}
              </div>
            </div>

            {meeting.status === "failed" ? (
              <div className="mt-5 flex flex-col gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-[#991b1b] sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5" />
                  <div>
                    <p className="font-semibold text-[#7f1d1d]">Recording Failed</p>
                    <p className="mt-1 text-[14px] text-[#991b1b]">{failureMessage}</p>
                  </div>
                </div>
                <Button type="button" variant="danger" onClick={handleStartBot} disabled={isPending}>
                  Try Again
                </Button>
              </div>
            ) : null}

            {actionError ? (
              <div className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#991b1b]">{actionError}</div>
            ) : null}
          </Card>

          <Card className="border-l-4 border-l-[#6c63ff] p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#6c63ff]" />
              <h2>Summary</h2>
            </div>
            <p className="mt-4 text-[14px] leading-7 text-[#374151]">
              {meeting.summary || "No summary is available yet for this meeting."}
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <h2>Key Decisions</h2>
              <Badge variant="neutral">{meeting.keyDecisions.length}</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {(meeting.keyDecisions.length > 0 ? meeting.keyDecisions : ["No key decisions were captured for this meeting."]).map(
                (decision, index) => (
                  <div key={`${decision}-${index}`} className="rounded-xl bg-[#f9fafb] p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f5f3ff] text-sm font-semibold text-[#6c63ff]">
                        {index + 1}
                      </span>
                      <p className="flex-1 text-[14px] leading-6 text-[#374151]">{decision}</p>
                    </div>
                  </div>
                )
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-[#6c63ff]" />
                <h2>Action Items</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={handleCopyActionItemsAsMarkdown}>
                  Copy as Markdown
                </Button>
                <Button type="button" variant="ghost" onClick={handleCopyActionItemsAsText}>
                  Copy as Text
                </Button>
              </div>
            </div>

            {copyFeedback ? (
              <div className="mt-4 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3 text-sm text-[#4b5563]">{copyFeedback}</div>
            ) : null}

            {meeting.actionItems.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-[#d1d5db] bg-[#f9fafb] p-4 text-sm text-[#6b7280]">
                No action items were saved for this meeting.
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-[#e5e7eb]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f9fafb]">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-[#6b7280]">Task</th>
                      <th className="px-4 py-3 font-semibold text-[#6b7280]">Owner</th>
                      <th className="px-4 py-3 font-semibold text-[#6b7280]">Due Date</th>
                      <th className="px-4 py-3 font-semibold text-[#6b7280]">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meeting.actionItems.map((item, index) => (
                      <tr key={`${item.task}-${index}`} className={index % 2 === 0 ? "bg-white" : "bg-[#fafafa]"}>
                        <td className="px-4 py-4 text-[#111827]">{item.task}</td>
                        <td className="px-4 py-4 text-[#4b5563]">{item.owner || "Unassigned"}</td>
                        <td className="px-4 py-4 text-[#4b5563]">{item.dueDate || item.deadline || "Not specified"}</td>
                        <td className="px-4 py-4">
                          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", getPriorityTone(item.priority))}>
                            {item.priority || "Medium"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {meeting.risksAndBlockers.length > 0 ? (
            <Card className="border-l-4 border-l-[#ca8a04] p-6">
              <div className="flex items-center gap-2">
                <TriangleAlert className="h-5 w-5 text-[#ca8a04]" />
                <h2>Risks &amp; Blockers</h2>
              </div>
              <div className="mt-4 space-y-3">
                {meeting.risksAndBlockers.map((item) => (
                  <div key={item} className="rounded-xl bg-[#fffbea] p-4">
                    <p className="text-[14px] leading-6 text-[#713f12]">{item}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {!showProcessedResults && meeting.status !== "failed" ? (
            <ResultState icon="loading" title="Report not ready yet" description={getStatusMessage(meeting.status)} />
          ) : null}
        </div>
      ) : null}

      {activeTab === "transcript" ? (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-2">
              {meeting.keyTopics.length > 0 ? (
                meeting.keyTopics.map((topic) => (
                  <span key={topic} className="rounded-full bg-[#f5f3ff] px-3 py-1 text-[12px] font-medium text-[#6c63ff]">
                    {topic}
                  </span>
                ))
              ) : (
                <span className="text-sm text-[#6b7280]">No key topics available yet.</span>
              )}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            {speakerStats.length > 0 ? (
              speakerStats.map((speaker) => (
                <Card key={speaker.speaker} className="p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f5f3ff] text-sm font-semibold text-[#6c63ff]">
                      {getInitials(speaker.speaker)}
                    </span>
                    <div>
                      <p className="font-semibold text-[#111827]">{speaker.speaker}</p>
                      <p className="text-caption">{speaker.percentage}% talk share</p>
                    </div>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-[#ede9fe]">
                    <div className="h-2 rounded-full bg-[#6c63ff]" style={{ width: `${speaker.percentage}%` }} />
                  </div>
                </Card>
              ))
            ) : (
              <Card className="p-6 lg:col-span-3">
                <p>No transcript is available yet.</p>
              </Card>
            )}
          </div>

          <Card className="p-6">
            <div className="space-y-4">
              {transcriptBlocks.length > 0 ? (
                transcriptBlocks.map((block, index) => (
                  <div
                    key={`${block.speaker}-${index}`}
                    className={cn("rounded-xl p-5", index % 2 === 0 ? "bg-[#f9fafb]" : "bg-[#f5f3ff]/40")}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-semibold text-[#111827]">{block.speaker}</p>
                      <button type="button" className="text-caption rounded-full bg-white px-2 py-1 hover:text-[#6c63ff]">
                        {block.timestamp}
                      </button>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap font-mono text-[13px] leading-7 text-[#374151]">{block.text}</p>
                  </div>
                ))
              ) : (
                <ResultState
                  title="Transcript unavailable"
                  description="Artiva will show transcript paragraphs, speaker groupings, and timestamps when the transcript is ready."
                />
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === "insights" ? (
        <div className="space-y-6">
          <Card className="p-6">
            <h2>Participation</h2>
            <div className="mt-4 space-y-4">
              {speakerStats.length > 0 ? (
                speakerStats.map((speaker) => (
                  <div key={speaker.speaker}>
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <p className="font-medium text-[#111827]">{speaker.speaker}</p>
                      <p className="text-caption">{speaker.percentage}%</p>
                    </div>
                    <div className="h-2 rounded-full bg-[#e5e7eb]">
                      <div className="h-2 rounded-full bg-[#6c63ff]" style={{ width: `${speaker.percentage}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <p>No speaker participation data yet.</p>
              )}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6">
              <p className="text-caption">Engagement Score</p>
              <p className="mt-3 text-3xl font-bold text-[#111827]">{engagementScore}</p>
              <p className="mt-1 text-sm text-[#4b5563]">{engagementLabel}</p>
            </Card>
            <Card className="p-6">
              <p className="text-caption">Sentiment</p>
              <p className="mt-3 text-3xl font-bold text-[#111827]">{meeting.meetingSentiment || "Neutral"}</p>
              <p className="mt-1 text-sm text-[#4b5563]">Conversation tone estimate</p>
            </Card>
            <Card className="p-6">
              <p className="text-caption">Follow-up needed</p>
              <p className="mt-3 text-3xl font-bold text-[#111827]">{meeting.followUpNeeded ? "Yes" : "No"}</p>
              <p className="mt-1 text-sm text-[#4b5563]">Based on summary signals</p>
            </Card>
          </div>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-5 w-5 text-[#6c63ff]" />
              <h2>Key Topics Timeline</h2>
            </div>
            <div className="mt-4 space-y-4">
              {topicTimeline.length > 0 ? (
                topicTimeline.map((item, index) => (
                  <div key={`${item.topic}-${index}`} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 h-3 w-3 rounded-full bg-[#6c63ff]" />
                      {index < topicTimeline.length - 1 ? <span className="mt-1 h-full w-px bg-[#ddd6fe]" /> : null}
                    </div>
                    <div className="pb-4">
                      <p className="font-medium text-[#111827]">{item.topic}</p>
                      <p className="text-caption">{item.timestamp}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p>No topic timeline available yet.</p>
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
