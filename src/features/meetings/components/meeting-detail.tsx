"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  Mic,
  Square,
  TimerReset,
} from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { ActionItemsCard } from "@/components/tools/action-items-card";
import { KeyPointsCard } from "@/components/tools/key-points-card";
import { ResultState } from "@/components/tools/result-state";
import { SummaryCard } from "@/components/tools/summary-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMeetingSessionProviderLabel } from "@/features/meeting-assistant/helpers";
import { fetchMeetingById, startMeetingCapture, stopMeetingCapture } from "@/features/meetings/api";
import {
  formatMeetingDate,
  formatMeetingDateTime,
  formatMeetingTime,
  getMeetingDetailStatusBadgeVariant,
  getMeetingDetailStatusLabel,
  hasProcessedMeetingContent,
} from "@/features/meetings/helpers";
import type { MeetingDetailRecord } from "@/features/meetings/types";
import { useSessionPolling } from "@/hooks/useSessionPolling";

type MeetingDetailProps = {
  meetingId: string;
};

function MeetingDetailSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((index) => (
        <Card key={index} className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-36 rounded-full bg-slate-100" />
            <div className="h-8 w-72 rounded-full bg-slate-200" />
            <div className="h-24 rounded-[1.5rem] bg-slate-100" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function getStatusMessage(status: MeetingDetailRecord["status"]) {
  switch (status) {
    case "waiting_for_join":
      return "AI Notetaker is joining the meeting...";
    case "capturing":
      return "Recording in progress...";
    case "processing":
      return "Transcribing and summarizing...";
    case "failed":
      return "Something went wrong. Please try again.";
    case "completed":
      return "Transcript and summary are ready.";
    default:
      return "AI Notetaker is ready to join this meeting.";
  }
}

export function MeetingDetail({ meetingId }: MeetingDetailProps) {
  const [meeting, setMeeting] = useState<MeetingDetailRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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
            transcript: session.transcript ?? currentMeeting.transcript,
          }
        : currentMeeting
    );

    if (session.state === "completed" || session.state === "failed") {
      void fetchMeetingById(meetingId)
        .then((nextMeeting) => {
          setMeeting(nextMeeting);
          setActionError(null);
        })
        .catch(() => null);
    }
  }, [meetingId, session]);

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
        setActionError(startError instanceof Error ? startError.message : "Failed to start AI Notetaker.");
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

  if (isLoading) {
    return <MeetingDetailSkeleton />;
  }

  if (notFound) {
    return (
      <ResultState
        title="Meeting not found"
        description="This meeting is unavailable or you no longer have access to it."
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
        description={error || "An unexpected error occurred while loading this meeting."}
      >
        <Button asChild variant="secondary">
          <Link href="/dashboard/meetings">Back to meetings</Link>
        </Button>
      </ResultState>
    );
  }

  const showProcessedResults =
    meeting.status === "completed" ||
    meeting.status === "processing" ||
    hasProcessedMeetingContent(meeting) ||
    (meeting.status === "failed" && hasProcessedMeetingContent(meeting));
  const canStartBot =
    meeting.canJoinAndCapture &&
    meeting.status !== "waiting_for_join" &&
    meeting.status !== "capturing" &&
    meeting.status !== "processing" &&
    meeting.status !== "completed";
  const canStopBot = meeting.status === "waiting_for_join" || meeting.status === "capturing";

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Meeting Detail"
        title={meeting.title}
        description="Review the meeting context and control the self-hosted AI Notetaker for this meeting."
        action={
          <Button asChild variant="secondary">
            <Link href="/dashboard/meetings">
              <ArrowLeft className="h-4 w-4" />
              Back to meetings
            </Link>
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-r from-sky-50 via-white to-orange-50 px-6 py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="available">{getMeetingSessionProviderLabel(meeting.provider)}</Badge>
                <Badge variant={getMeetingDetailStatusBadgeVariant(meeting.status)}>
                  {getMeetingDetailStatusLabel(meeting.status)}
                </Badge>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{meeting.title}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <button
                  type="button"
                  onClick={handleOpenMeetingLink}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 hover:border-sky-200 hover:text-slate-950"
                >
                  <Link2 className="h-4 w-4 text-sky-600" />
                  Open meeting link
                  <ExternalLink className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-white/85 px-4 py-3 text-sm text-slate-600">
              <div className="flex items-center gap-2 font-medium text-slate-800">
                <CalendarDays className="h-4 w-4 text-slate-500" />
                {meeting.scheduledStartTime
                  ? formatMeetingDate(meeting.scheduledStartTime)
                  : meeting.createdAt
                    ? formatMeetingDate(meeting.createdAt)
                    : "Date unavailable"}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Scheduled Date</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {meeting.scheduledStartTime
                ? formatMeetingDate(meeting.scheduledStartTime)
                : meeting.createdAt
                  ? formatMeetingDate(meeting.createdAt)
                  : "Unavailable"}
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Start Time</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {meeting.scheduledStartTime
                ? formatMeetingTime(meeting.scheduledStartTime)
                : meeting.createdAt
                  ? formatMeetingTime(meeting.createdAt)
                  : "Unavailable"}
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">End Time</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {meeting.scheduledEndTime ? formatMeetingTime(meeting.scheduledEndTime) : "Unavailable"}
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current Status</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">{getMeetingDetailStatusLabel(meeting.status)}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-950">AI Notetaker</h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">{getStatusMessage(meeting.status)}</p>
          </div>
          {canStartBot ? (
            <Button type="button" size="lg" onClick={handleStartBot} disabled={isPending}>
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              Start AI Notetaker
            </Button>
          ) : canStopBot ? (
            <Button type="button" size="lg" variant="secondary" onClick={handleStopBot} disabled={isPending}>
              {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Stop Recording
            </Button>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
              <TimerReset className="h-4 w-4 text-slate-500" />
              {meeting.status === "completed"
                ? "This meeting already has completed results."
                : getStatusMessage(meeting.status)}
            </div>
          )}
        </div>

        {actionError ? (
          <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {actionError}
          </div>
        ) : null}
      </Card>

      {(meeting.status === "waiting_for_join" || meeting.status === "capturing" || meeting.status === "processing") ? (
        <Card className="overflow-hidden border-sky-200">
          <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-cyan-50 px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Live Status</p>
                <h2 className="text-xl font-semibold text-slate-950">{getStatusMessage(meeting.status)}</h2>
                <p className="text-sm text-slate-600">
                  {meeting.status === "waiting_for_join"
                    ? "The bot is launching a browser session and joining Google Meet."
                    : meeting.status === "capturing"
                      ? "Meeting audio is being recorded for transcription."
                      : "The recording has stopped and the transcript is being processed."}
                </p>
              </div>
              <Badge variant={getMeetingDetailStatusBadgeVariant(meeting.status)}>
                {getMeetingDetailStatusLabel(meeting.status)}
              </Badge>
            </div>
          </div>
          <div className="grid gap-4 p-6 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Meeting Session</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{meeting.meetingSessionId ?? "Pending"}</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Last Updated</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {session?.updatedAt ? formatMeetingDateTime(session.updatedAt) : "Waiting for update"}
              </p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Transcript</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {meeting.transcript?.trim() ? "Available" : "Not ready yet"}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {meeting.status === "failed" && !hasProcessedMeetingContent(meeting) ? (
        <ResultState icon="error" title="AI Notetaker failed" description={getStatusMessage(meeting.status)} />
      ) : null}

      {showProcessedResults ? (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Transcript</h2>
                  <p className="text-sm text-slate-500">Transcript saved for this meeting session.</p>
                </div>
              </div>
              <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5 text-sm leading-7 text-slate-700">
                {meeting.transcript || "No transcript was saved for this meeting."}
              </div>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              {meeting.status === "failed" ? (
                <ResultState
                  icon="error"
                  title="Meeting processing failed"
                  description="The meeting recording stopped, but summary generation did not finish successfully."
                />
              ) : meeting.status === "processing" ? (
                <ResultState
                  icon="loading"
                  title="Processing meeting recording"
                  description="Transcript and structured meeting results are still being prepared."
                />
              ) : (
                <SummaryCard summary={meeting.summary || "No summary available for this meeting yet."} />
              )}
              <KeyPointsCard
                items={meeting.keyPoints.length > 0 ? meeting.keyPoints : ["No key points were saved for this meeting."]}
              />
            </div>
            <aside className="space-y-6">
              <ActionItemsCard items={meeting.actionItems} />
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
}
