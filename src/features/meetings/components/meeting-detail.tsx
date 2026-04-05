"use client";

import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckSquare,
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
import { copyTextToClipboard, getMeetingSessionProviderLabel, normalizeMeetingActionItems } from "@/features/meeting-assistant/helpers";
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

const SPEAKER_COLORS = ["#6c63ff", "#16a34a", "#2563eb", "#ca8a04", "#dc2626", "#0891b2"];
const WORD_COLORS = ["#6c63ff", "#16a34a", "#2563eb", "#ca8a04", "#dc2626", "#0891b2", "#7c3aed", "#059669", "#d97706"];

function ScoreCard({
  label,
  value,
  max,
  color,
  isText,
  subtitle
}: {
  label: string;
  value: string | number | null | undefined;
  max?: number;
  color: string;
  isText?: boolean;
  subtitle?: string;
}) {
  const numericValue = typeof value === "number" ? value : 0;

  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        padding: "20px",
        border: "1px solid #f3f4f6",
        textAlign: "center"
      }}
    >
      <p
        style={{
          fontSize: "12px",
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "8px"
        }}
      >
        {label}
      </p>
      {isText ? (
        <p style={{ fontSize: "20px", fontWeight: 700, color, textTransform: "capitalize" }}>
          {String(value || "Unknown")}
        </p>
      ) : (
        <>
          <p style={{ fontSize: "32px", fontWeight: 700, color }}>
            {max ? `${numericValue}` : typeof value === "number" ? value.toLocaleString() : String(value || 0)}
          </p>
          {max ? (
            <div style={{ height: "4px", background: "#f3f4f6", borderRadius: "9999px", marginTop: "8px" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(0, Math.min(100, (numericValue / max) * 100))}%`,
                  background: color,
                  borderRadius: "9999px"
                }}
              />
            </div>
          ) : null}
        </>
      )}
      {subtitle ? <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>{subtitle}</p> : null}
    </div>
  );
}

function InsightsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        padding: "20px 24px",
        border: "1px solid #f3f4f6",
        marginBottom: "16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
      }}
    >
      <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#111827", marginBottom: "16px" }}>{title}</h3>
      {children}
    </div>
  );
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "Unknown";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

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
      return "Preparing to join the meeting in a separate browser.";
    case "waiting_for_admission":
      return "Waiting for the meeting host to admit the Artivaa bot.";
    case "capturing":
      return "Recording in progress. Audio is being captured for transcription.";
    case "processing":
      return "Processing the saved recording and preparing the transcript.";
    case "summarizing":
      return "Generating the structured Artivaa summary and action items.";
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
    unsupported_platform: "This meeting platform is not supported yet.",
    meet_access_denied: "Bot cannot access this meeting. Run: npm run setup:bot-profile",
    invalid_meeting_link: "Meeting link is invalid or expired.",
    no_audio_captured: "No audio was captured. Check MEETING_AUDIO_SOURCE setting.",
    bot_kicked: "Bot was removed from the meeting.",
    transcription_failed: "Transcription failed. Audio may be too short.",
    empty_transcript: "Transcript was empty. Audio may be silence — check MEETING_AUDIO_SOURCE.",
    summary_failed: "Summary generation failed.",
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

function getPlatformFromUrl(url: string | null | undefined) {
  if (!url) {
    return "google";
  }

  const normalized = url.toLowerCase();

  if (normalized.includes("zoom.us") || normalized.includes("zoom.com")) {
    return "zoom";
  }

  if (normalized.includes("teams.microsoft.com") || normalized.includes("teams.live.com")) {
    return "teams";
  }

  return "google";
}

function AudioPlayer({ url, duration }: { url: string; duration: number | null | undefined }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;

    fetch(url, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load recording (${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((err: unknown) => {
        setAudioError(err instanceof Error ? err.message : "Failed to load recording.");
      });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return (
    <div
      style={{
        background: "white",
        borderRadius: "12px",
        padding: "20px 24px",
        border: "1px solid #f3f4f6",
        marginBottom: "20px"
      }}
    >
      <h3 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>🎵 Meeting Recording</h3>
      {audioError ? (
        <p style={{ fontSize: "13px", color: "#dc2626" }}>{audioError}</p>
      ) : blobUrl ? (
        <audio controls style={{ width: "100%" }} src={blobUrl}>
          Your browser does not support audio.
        </audio>
      ) : (
        <p style={{ fontSize: "13px", color: "#9ca3af" }}>Loading recording…</p>
      )}
      {duration ? (
        <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "8px" }}>
          Duration: {formatDuration(duration)}
        </p>
      ) : null}
    </div>
  );
}

function getPlatformConfig(platform: string) {
  const platformConfig: Record<string, { name: string; color: string; bg: string }> = {
    google: { name: "Google Meet", color: "#00AC47", bg: "#e8f5e9" },
    zoom: { name: "Zoom", color: "#2D8CFF", bg: "#e3f2fd" },
    teams: { name: "Microsoft Teams", color: "#6264A7", bg: "#ede7f6" },
    unknown: { name: "Unknown", color: "#6b7280", bg: "#f3f4f6" }
  };

  return platformConfig[platform] || platformConfig.unknown;
}

export function MeetingDetail({ meetingId }: MeetingDetailProps) {
  const router = useRouter();
  const [meeting, setMeeting] = useState<MeetingDetailRecord | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("notes");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [upgradeBlocked, setUpgradeBlocked] = useState<{ reason: "upgrade_required" | "limit_reached" } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Only poll when the meeting session is actively in-progress
  const activeStates = new Set(["joining", "waiting_for_join", "waiting_for_admission", "joined", "capturing", "processing", "summarizing"]);
  const shouldPoll = meeting?.meetingSessionId != null && meeting?.status != null && activeStates.has(meeting.status);
  const session = useSessionPolling(shouldPoll ? (meeting?.meetingSessionId ?? null) : null);

  useEffect(() => {
    let isMounted = true;

    async function loadMeeting() {
      setIsLoading(true);
      setError(null);
      setNotFound(false);
      setUpgradeBlocked(null);

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

    setMeeting((currentMeeting) => {
      if (!currentMeeting) {
        return currentMeeting;
      }
      const structured = session.summary;
      return {
        ...currentMeeting,
        status: session.state,
        errorCode: session.errorCode ?? currentMeeting.errorCode,
        failureReason: session.failureReason ?? currentMeeting.failureReason,
        captureStartedAt: session.recordingStartedAt ?? currentMeeting.captureStartedAt,
        captureEndedAt: session.recordingEndedAt ?? currentMeeting.captureEndedAt,
        transcript: session.transcript ?? currentMeeting.transcript,
        summary: structured?.summary ?? currentMeeting.summary,
        keyPoints: structured?.key_points?.length ? structured.key_points : currentMeeting.keyPoints,
        actionItems: structured?.action_items?.length
          ? normalizeMeetingActionItems(structured.action_items)
          : currentMeeting.actionItems,
        recordingUrl: session.recordingUrl ?? currentMeeting.recordingUrl,
        recordingDuration: session.recordingDuration ?? currentMeeting.recordingDuration,
        insights: session.insights ?? currentMeeting.insights,
        chapters: session.chapters ?? currentMeeting.chapters
      };
    });

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
    setUpgradeBlocked(null);

    startTransition(async () => {
      try {
        const started = await startMeetingCapture(meeting.id, meeting.meetingLink);
        setMeeting(started.meeting);
        if (started.status === "already_recording" && started.meeting.id !== meetingId) {
          router.replace(`/dashboard/meetings/${started.meeting.id}` as Route);
        }
      } catch (startError) {
        const errorWithMeta = startError as Error & { status?: number; code?: string };

        if (errorWithMeta.status === 403 && (errorWithMeta.code === "upgrade_required" || errorWithMeta.code === "limit_reached")) {
          setUpgradeBlocked({
            reason: errorWithMeta.code
          });
          setActionError(null);
          return;
        }

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

  const effectiveStatus: MeetingDetailRecord["status"] =
    meeting.status === "scheduled" && hasProcessedMeetingContent(meeting) ? "completed" : meeting.status;

  const failureMessage = getFailureMessage(meeting.errorCode ?? null, meeting.failureReason || actionError);
  const sessionPlatform = session?.platform || getPlatformFromUrl(meeting.meetingLink);
  const platform = getPlatformConfig(sessionPlatform);
  const platformName = session?.platformName || platform.name;
  const recordingUrl = session?.recordingUrl ?? meeting.recordingUrl;
  const recordingDuration = session?.recordingDuration ?? meeting.recordingDuration;
  const resolvedInsights = (session?.insights ?? meeting.insights) as
    | {
        speakers?: Array<{ name: string; talkTimePercent: number; wordCount: number; sentiment: string }>;
        sentiment?: {
          overall?: string;
          score?: number;
          timeline?: Array<{ segment: number; label: string; score: number }>;
        };
        topics?: Array<{ title: string; duration: number; summary: string }>;
        wordCloud?: Array<{ word: string; count: number }>;
        engagementScore?: number;
        totalWords?: number;
        avgWordsPerMinute?: number;
        keyMoments?: Array<{ time: string; description: string }>;
      }
    | null;
  const resolvedChapters = (session?.chapters ?? meeting.chapters) as
    | Array<{ title: string; startMinute: number; endMinute: number; summary: string }>
    | null;

  const durationLabel = formatMeetingDuration(meeting.meetingDuration);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Artivaa"
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
              {renderStatusBadge(effectiveStatus)}
              <Badge variant="neutral">{getMeetingSessionProviderLabel(meeting.provider)}</Badge>
              <span
                style={{
                  background: platform.bg,
                  color: platform.color,
                  padding: "4px 12px",
                  borderRadius: "9999px",
                  fontSize: "12px",
                  fontWeight: 600
                }}
              >
                {platformName}
              </span>
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
              <p className="mt-1 font-semibold text-[#111827]">
                {participantCount > 0 ? participantCount : "—"}
              </p>
              {speakerStats.length > 0 ? (
                <p className="mt-1 text-[12px] text-[#6b7280]">
                  {speakerStats.map((s) => s.speaker).join(", ")}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl bg-[#f9fafb] p-4">
              <p className="text-caption">Platform</p>
              <p className="mt-1 font-semibold text-[#111827]">{platformName}</p>
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
                  {renderStatusBadge(effectiveStatus)}
                  <span className="text-caption">AI Notetaker</span>
                </div>
                <h2>AI Notetaker control</h2>
                <p>{getStatusMessage(effectiveStatus)}</p>
                <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
                  Supports Google Meet, Zoom, and Microsoft Teams
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {canStartBot && !upgradeBlocked ? (
                  <Button type="button" onClick={handleStartBot} disabled={isPending}>
                    {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                    Start AI Notetaker
                  </Button>
                ) : canStartBot && upgradeBlocked ? (
                  <Button asChild className="bg-[#1f1147] text-white hover:bg-[#140b33]">
                    <Link href="/dashboard/billing">Upgrade to Pro to record meetings</Link>
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

            {upgradeBlocked ? (
              <div className="mt-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#b45309]">Locked Feature</p>
                    <p className="mt-2 font-semibold text-[#111827]">Meeting recording requires Pro or Elite</p>
                    <p className="mt-1 text-sm text-[#92400e]">
                      {upgradeBlocked.reason === "limit_reached"
                        ? "You have reached your monthly meeting limit."
                        : "Free plan users can keep using the three core generators, but meeting capture is locked."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link href="/dashboard/billing">Upgrade to Pro - ₹99/mo</Link>
                    </Button>
                    <Button asChild variant="secondary">
                      <Link href="/dashboard/billing">View all plans</Link>
                    </Button>
                  </div>
                </div>
              </div>
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
                        <td className="px-4 py-4 text-[#4b5563]">
                          {item.owner && item.owner.trim()
                            ? item.owner
                            : speakerStats.length > 0
                              ? speakerStats[0].speaker
                              : "Unassigned"}
                        </td>
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
          {recordingUrl ? (
            <AudioPlayer url={recordingUrl} duration={recordingDuration} />
          ) : null}

          {session?.transcript || meeting.transcript ? (
            <div
              style={{
                background: "white",
                borderRadius: "12px",
                padding: "24px",
                border: "1px solid #f3f4f6"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px"
                }}
              >
                <h3 style={{ fontSize: "16px", fontWeight: 600 }}>Full Transcript</h3>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(session?.transcript || meeting.transcript || "");
                    alert("Transcript copied!");
                  }}
                  style={{
                    padding: "6px 14px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    background: "white",
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                >
                  Copy
                </button>
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "13px",
                  lineHeight: "1.8",
                  color: "#374151",
                  whiteSpace: "pre-wrap",
                  maxHeight: "600px",
                  overflowY: "auto",
                  padding: "16px",
                  background: "#f8fafc",
                  borderRadius: "8px"
                }}
              >
                {session?.transcript || meeting.transcript}
              </div>
            </div>
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "48px",
                color: "#9ca3af",
                background: "white",
                borderRadius: "12px",
                border: "1px solid #f3f4f6"
              }}
            >
              <p style={{ fontSize: "14px" }}>Transcript will appear here after the meeting is processed.</p>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "insights" ? (
        <div className="space-y-6">
          {!resolvedInsights ? (
            <div style={{ textAlign: "center", padding: "48px" }}>
              <p>Insights are being generated...</p>
              <p style={{ color: "#9ca3af", fontSize: "13px" }}>
                This may take a moment after the meeting ends.
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "16px",
                  marginBottom: "24px"
                }}
              >
                <ScoreCard
                  label="Engagement Score"
                  value={resolvedInsights.engagementScore ?? 0}
                  max={100}
                  color="#6c63ff"
                />
                <ScoreCard
                  label="Overall Sentiment"
                  value={resolvedInsights.sentiment?.overall ?? "neutral"}
                  isText
                  color={
                    resolvedInsights.sentiment?.overall === "positive"
                      ? "#16a34a"
                      : resolvedInsights.sentiment?.overall === "negative"
                        ? "#dc2626"
                        : "#ca8a04"
                  }
                />
                <ScoreCard
                  label="Total Words"
                  value={resolvedInsights.totalWords ?? 0}
                  subtitle={`~${resolvedInsights.avgWordsPerMinute ?? 0} wpm`}
                  color="#2563eb"
                />
              </div>

              <InsightsCard title="👥 Speaker Participation">
                {(resolvedInsights.speakers || []).length > 0 ? (
                  (resolvedInsights.speakers || []).map((speaker, index) => (
                    <div key={`${speaker.name}-${index}`} style={{ marginBottom: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              background: SPEAKER_COLORS[index % SPEAKER_COLORS.length],
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "white",
                              fontSize: "12px",
                              fontWeight: 600
                            }}
                          >
                            {speaker.name.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 500, fontSize: "14px" }}>{speaker.name}</span>
                        </div>
                        <span style={{ fontSize: "13px", color: "#6b7280", fontWeight: 600 }}>
                          {speaker.talkTimePercent}%
                        </span>
                      </div>
                      <div
                        style={{
                          height: "8px",
                          background: "#f3f4f6",
                          borderRadius: "9999px",
                          overflow: "hidden"
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${speaker.talkTimePercent}%`,
                            background: SPEAKER_COLORS[index % SPEAKER_COLORS.length],
                            borderRadius: "9999px",
                            transition: "width 0.8s ease"
                          }}
                        />
                      </div>
                      <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "4px" }}>
                        {speaker.wordCount} words · {speaker.sentiment}
                      </p>
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: "13px", color: "#6b7280" }}>No speaker analytics available yet.</p>
                )}
              </InsightsCard>

              <InsightsCard title="📌 Topics Covered">
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {(resolvedInsights.topics || []).length > 0 ? (
                    (resolvedInsights.topics || []).map((topic, index) => (
                      <div
                        key={`${topic.title}-${index}`}
                        style={{
                          padding: "8px 16px",
                          background: "#f5f3ff",
                          borderRadius: "8px",
                          border: "1px solid #e9d5ff"
                        }}
                      >
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#6c63ff" }}>{topic.title}</div>
                        <div style={{ fontSize: "12px", color: "#9ca3af" }}>~{topic.duration} min</div>
                        <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "2px" }}>{topic.summary}</div>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: "13px", color: "#6b7280" }}>No topic analytics available yet.</p>
                  )}
                </div>
              </InsightsCard>

              <InsightsCard title="😊 Sentiment Timeline">
                <div style={{ display: "flex", gap: "4px", alignItems: "flex-end", height: "60px" }}>
                  {(resolvedInsights.sentiment?.timeline || []).map((point, index) => (
                    <div
                      key={index}
                      title={`${point.label}: ${point.score}/100`}
                      style={{
                        flex: 1,
                        height: `${point.score}%`,
                        background:
                          point.label === "positive" ? "#16a34a" : point.label === "negative" ? "#dc2626" : "#ca8a04",
                        borderRadius: "4px 4px 0 0",
                        opacity: 0.8,
                        minHeight: "4px"
                      }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "8px",
                    fontSize: "11px",
                    color: "#9ca3af"
                  }}
                >
                  <span>Start</span>
                  <span>End</span>
                </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "8px", fontSize: "12px" }}>
                  <span style={{ color: "#16a34a" }}>● Positive</span>
                  <span style={{ color: "#ca8a04" }}>● Neutral</span>
                  <span style={{ color: "#dc2626" }}>● Negative</span>
                </div>
              </InsightsCard>

              <InsightsCard title="💬 Key Words">
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {(resolvedInsights.wordCloud || []).map((item, index) => {
                    const size = Math.max(11, Math.min(22, 11 + item.count * 1.5));
                    return (
                      <span
                        key={`${item.word}-${index}`}
                        style={{
                          fontSize: `${size}px`,
                          color: WORD_COLORS[index % WORD_COLORS.length],
                          fontWeight: item.count > 8 ? 600 : 400,
                          padding: "2px 4px"
                        }}
                      >
                        {item.word}
                      </span>
                    );
                  })}
                </div>
              </InsightsCard>

              {(resolvedInsights.keyMoments || []).length > 0 ? (
                <InsightsCard title="⚡ Key Moments">
                  {(resolvedInsights.keyMoments || []).map((moment, index) => (
                    <div
                      key={`${moment.time}-${index}`}
                      style={{
                        display: "flex",
                        gap: "12px",
                        padding: "12px 0",
                        borderBottom:
                          index < (resolvedInsights.keyMoments || []).length - 1 ? "1px solid #f3f4f6" : "none"
                      }}
                    >
                      <span
                        style={{
                          background: "#f5f3ff",
                          color: "#6c63ff",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          whiteSpace: "nowrap"
                        }}
                      >
                        {moment.time}
                      </span>
                      <span style={{ fontSize: "13px", color: "#374151" }}>{moment.description}</span>
                    </div>
                  ))}
                </InsightsCard>
              ) : null}

              {(resolvedChapters || []).length > 0 ? (
                <InsightsCard title="📖 Meeting Chapters">
                  {(resolvedChapters || []).map((chapter, index) => (
                    <div
                      key={`${chapter.title}-${index}`}
                      style={{
                        padding: "12px 0",
                        borderBottom: index < (resolvedChapters || []).length - 1 ? "1px solid #f3f4f6" : "none"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span
                          style={{
                            background: "#6c63ff",
                            color: "white",
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                            fontWeight: 600,
                            flexShrink: 0
                          }}
                        >
                          {index + 1}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: "14px", color: "#111827" }}>{chapter.title}</span>
                        <span style={{ fontSize: "12px", color: "#9ca3af", marginLeft: "auto" }}>
                          {chapter.startMinute}m – {chapter.endMinute}m
                        </span>
                      </div>
                      <p style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 0 32px" }}>{chapter.summary}</p>
                    </div>
                  ))}
                </InsightsCard>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
