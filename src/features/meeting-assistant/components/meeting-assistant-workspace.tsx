"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileAudio2,
  FileText,
  Link2,
  ListChecks,
  Mic,
  NotebookPen,
  Sparkles,
  Square,
  Video
} from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { ActionItemsCard } from "@/components/tools/action-items-card";
import { KeyPointsCard } from "@/components/tools/key-points-card";
import { ResultState } from "@/components/tools/result-state";
import { SummaryCard } from "@/components/tools/summary-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createMeetingSessionRecord,
  updateMeetingSessionRecord
} from "@/features/meeting-assistant/api";
import {
  getMeetingSessionStatusBadgeVariant,
  getMeetingSessionStatusLabel
} from "@/features/meeting-assistant/helpers";
import { summarizeMeetingSessionTranscript } from "@/features/meeting-assistant/processing";
import type { MeetingAssistantPrefill, MeetingSessionRecord } from "@/features/meeting-assistant/types";
import {
  getMeetingProviderLabel,
  getMeetingTranscriptionProviderLabel
} from "@/features/tools/meeting-summarizer/config";
import {
  transcribeMeetingRecording,
  type ToolRunResponse
} from "@/features/tools/meeting-summarizer/api";
import type {
  MeetingAiProvider,
  MeetingSummarizerOutput,
  MeetingTranscriptionProvider
} from "@/features/tools/meeting-summarizer/types";

type MeetingAssistantWorkspaceProps = {
  defaultProvider: MeetingAiProvider;
  defaultTranscriptionProvider: MeetingTranscriptionProvider;
  initialContext?: MeetingAssistantPrefill | null;
};

type AudioFlowState =
  | "idle"
  | "recording"
  | "recorded"
  | "transcribing"
  | "transcript_ready"
  | "summarizing"
  | "completed"
  | "error";

type RecordedAudio = {
  blob: Blob;
  file: File;
  previewUrl: string;
  durationMs: number;
};

type SetupFormState = {
  title: string;
  meetingLink: string;
  notes: string;
};

function createSetupState(initialContext?: MeetingAssistantPrefill | null): SetupFormState {
  return {
    title: initialContext?.title ?? "",
    meetingLink: initialContext?.meetingLink ?? "",
    notes: ""
  };
}

function formatRecordingDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatSessionDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getStepState(step: 1 | 2 | 3 | 4, state: AudioFlowState) {
  if (step === 1) {
    if (
      state === "recorded" ||
      state === "transcribing" ||
      state === "transcript_ready" ||
      state === "summarizing" ||
      state === "completed"
    ) {
      return "complete";
    }

    return "current";
  }

  if (step === 2) {
    if (state === "transcript_ready" || state === "summarizing" || state === "completed") {
      return "complete";
    }

    if (state === "transcribing") {
      return "current";
    }

    return "upcoming";
  }

  if (step === 3) {
    if (state === "completed") {
      return "complete";
    }

    if (state === "summarizing") {
      return "current";
    }

    return "upcoming";
  }

  if (state === "completed") {
    return "complete";
  }

  return "upcoming";
}

export function MeetingAssistantWorkspace({
  defaultProvider,
  defaultTranscriptionProvider,
  initialContext
}: MeetingAssistantWorkspaceProps) {
  const [setup, setSetup] = useState<SetupFormState>(() => createSetupState(initialContext));
  const [meetingSession, setMeetingSession] = useState<MeetingSessionRecord | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [audioFlowState, setAudioFlowState] = useState<AudioFlowState>("idle");
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudio | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<ToolRunResponse<MeetingSummarizerOutput>["run"] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [summarizerProvider] = useState<MeetingAiProvider>(defaultProvider);
  const [transcriptionProvider] = useState<MeetingTranscriptionProvider>(defaultTranscriptionProvider);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setSetup(createSetupState(initialContext));
    setSetupError(null);
    setMeetingSession(null);
    setWorkspaceError(null);
    setAudioFlowState("idle");
    setRecordingDurationMs(0);
    setRecordedAudio(null);
    setRecordingError(null);
    setTranscript("");
    setTranscriptError(null);
    setLatestRun(null);
  }, [initialContext]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }

      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

      if (recordedAudio?.previewUrl) {
        URL.revokeObjectURL(recordedAudio.previewUrl);
      }
    };
  }, [recordedAudio]);

  function clearRecordingTimer() {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  function stopMediaStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function updateSetupField(field: keyof SetupFormState, value: string) {
    setSetup((current) => ({
      ...current,
      [field]: value
    }));

    if (setupError) {
      setSetupError(null);
    }
  }

  function validateSetup() {
    if (!setup.title.trim()) {
      setSetupError("Enter a meeting title before starting Artivaa.");
      return false;
    }

    if (setup.title.trim().length < 3) {
      setSetupError("Meeting title must be at least 3 characters long.");
      return false;
    }

    if (!setup.meetingLink.trim()) {
      setSetupError("Enter the Google Meet link before starting Artivaa.");
      return false;
    }

    try {
      new URL(setup.meetingLink);
    } catch {
      setSetupError("Enter a valid Google Meet link.");
      return false;
    }

    return true;
  }

  async function ensureMeetingSession(
    status?: "draft" | "recording" | "recorded" | "transcribed" | "processing" | "completed" | "failed",
    options?: {
      forceNew?: boolean;
    }
  ) {
    if (meetingSession && !options?.forceNew) {
      const nextSession = await updateMeetingSessionRecord(meetingSession.id, {
        title: setup.title,
        meetingLink: setup.meetingLink,
        notes: setup.notes,
        ...(status ? { status } : {})
      });
      setMeetingSession(nextSession);
      return nextSession;
    }

    const nextSession = await createMeetingSessionRecord({
      title: setup.title,
      meetingLink: setup.meetingLink,
      notes: setup.notes,
      provider: "google_meet"
    });

    const resolvedSession =
      status && status !== "draft"
        ? await updateMeetingSessionRecord(nextSession.id, { status })
        : nextSession;

    setMeetingSession(resolvedSession);
    return resolvedSession;
  }

  async function markMeetingSessionFailed(message: string, sessionId?: string) {
    const targetSessionId = sessionId ?? meetingSession?.id;

    if (targetSessionId) {
      try {
        const failedSession = await updateMeetingSessionRecord(targetSessionId, {
          title: setup.title,
          meetingLink: setup.meetingLink,
          notes: setup.notes,
          transcript: transcript.trim() || undefined,
          status: "failed"
        });
        setMeetingSession(failedSession);
      } catch {
        // Preserve the original processing error even if the failure-state update also fails.
      }
    }

    setAudioFlowState("error");
    setWorkspaceError(message);
  }

  async function runAutomaticPostMeetingFlow(audio: RecordedAudio) {
    setWorkspaceError(null);
    setRecordingError(null);
    setTranscriptError(null);

    const session = await ensureMeetingSession("processing");

    setAudioFlowState("transcribing");
    const transcription = await transcribeMeetingRecording(audio.file, transcriptionProvider);
    const transcriptText = transcription.transcript.trim();

    if (!transcriptText) {
      throw new Error("Transcript was empty. Please record again and retry transcription.");
    }

    setTranscript(transcriptText);
    const processingSession = await updateMeetingSessionRecord(session.id, {
      title: setup.title,
      meetingLink: setup.meetingLink,
      notes: setup.notes,
      transcript: transcriptText,
      status: "processing"
    });
    setMeetingSession(processingSession);

    setAudioFlowState("summarizing");
    const result = await summarizeMeetingSessionTranscript({
      sessionId: processingSession.id,
      title: setup.title,
      meetingLink: setup.meetingLink,
      notes: setup.notes,
      transcript: transcriptText,
      provider: summarizerProvider,
      transcriptionProvider
    });

    setLatestRun(result.run);
    setMeetingSession(result.session);
    setAudioFlowState("completed");
  }

  async function handleStartRecording() {
    if (!validateSetup()) {
      return;
    }

    try {
      setWorkspaceError(null);
      setRecordingError(null);
      setTranscriptError(null);
      setSetupError(null);

      if (recordedAudio?.previewUrl) {
        URL.revokeObjectURL(recordedAudio.previewUrl);
      }

      setLatestRun(null);
      setTranscript("");
      setRecordedAudio(null);
      setRecordingDurationMs(0);
      recordingChunksRef.current = [];

      const session = await ensureMeetingSession("recording", {
        forceNew: meetingSession?.status === "completed" || meetingSession?.status === "failed"
      });

      if (!session) {
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedMimeType = [
        "audio/ogg;codecs=opus",
        "audio/ogg",
        "audio/webm;codecs=opus",
        "audio/webm"
      ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
      const mediaRecorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = mediaRecorder;
      recordingStartedAtRef.current = Date.now();
      setAudioFlowState("recording");

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const durationMs = recordingStartedAtRef.current ? Date.now() - recordingStartedAtRef.current : recordingDurationMs;
        const blob = new Blob(recordingChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm"
        });
        const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("wav") ? "wav" : "webm";
        const file = new File([blob], `meeting-recording.${extension}`, {
          type: blob.type || "audio/webm"
        });
        const previewUrl = URL.createObjectURL(blob);
        const nextRecordedAudio = {
          blob,
          file,
          previewUrl,
          durationMs
        };

        setRecordedAudio(nextRecordedAudio);
        setRecordingDurationMs(durationMs);
        setAudioFlowState("recorded");
        clearRecordingTimer();
        stopMediaStream();
        startTransition(async () => {
          try {
            await ensureMeetingSession("recorded");
            await runAutomaticPostMeetingFlow(nextRecordedAudio);
          } catch (error) {
            await markMeetingSessionFailed(
              error instanceof Error ? error.message : "Failed to process the meeting recording."
            );
          }
        });
      };

      mediaRecorder.start();
      recordingTimerRef.current = window.setInterval(() => {
        if (!recordingStartedAtRef.current) {
          return;
        }

        setRecordingDurationMs(Date.now() - recordingStartedAtRef.current);
      }, 250);
    } catch (error) {
      clearRecordingTimer();
      stopMediaStream();
      setAudioFlowState("error");
      setRecordingError(
        error instanceof Error ? error.message : "Microphone access is required to start recording."
      );
    }
  }

  function handleStopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  function handleGenerateTranscript() {
    if (!validateSetup()) {
      return;
    }

    if (!recordedAudio) {
      setRecordingError("Record your meeting audio before generating a transcript.");
      setAudioFlowState("error");
      return;
    }

    setWorkspaceError(null);
    setRecordingError(null);
    setTranscriptError(null);

    startTransition(async () => {
      try {
        await runAutomaticPostMeetingFlow(recordedAudio);
      } catch (error) {
        await markMeetingSessionFailed(
          error instanceof Error ? error.message : "Failed to generate transcript."
        );
      }
    });
  }

  function handleGenerateSummary() {
    if (!validateSetup()) {
      return;
    }

    if (!recordedAudio) {
      setRecordingError("Record your meeting audio before generating a summary.");
      setAudioFlowState("error");
      return;
    }

    if (!transcript.trim()) {
      setTranscriptError("Generate or enter a transcript before creating the summary.");
      return;
    }

    setWorkspaceError(null);
    setRecordingError(null);
    setTranscriptError(null);

    startTransition(async () => {
      try {
        const session = await ensureMeetingSession("processing");
        setAudioFlowState("summarizing");
        const result = await summarizeMeetingSessionTranscript({
          sessionId: session.id,
          title: setup.title,
          meetingLink: setup.meetingLink,
          notes: setup.notes,
          transcript: transcript.trim(),
          provider: summarizerProvider,
          transcriptionProvider
        });

        setLatestRun(result.run);
        setAudioFlowState("completed");
        setMeetingSession(result.session);
      } catch (error) {
        await markMeetingSessionFailed(
          error instanceof Error ? error.message : "Failed to generate summary."
        );
      }
    });
  }

  const currentSummary = latestRun?.outputJson.summary ?? meetingSession?.summary ?? "";
  const currentKeyPoints =
    latestRun?.outputJson.key_points ?? meetingSession?.keyPoints ?? [];
  const currentActionItems =
    latestRun?.outputJson.action_items ?? meetingSession?.actionItems ?? [];

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Artivaa"
        title="From meetings to meaningful work."
        description="Set up the meeting, capture the recording, generate the transcript, and save a structured Artivaa session."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="available">Google Meet</Badge>
            <Badge variant="pending">{getMeetingProviderLabel(summarizerProvider)}</Badge>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 bg-gradient-to-r from-sky-50 via-white to-orange-50 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Setup Card</p>
                  <h2 className="text-xl font-semibold text-slate-950">Meeting setup</h2>
                  <p className="text-sm text-slate-600">Define the Google Meet session before you record and process it.</p>
                </div>
                <div className="rounded-2xl bg-white/90 p-3 text-sky-700 shadow-soft">
                  <Video className="h-5 w-5" />
                </div>
              </div>
            </div>
            <div className="space-y-5 p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-900">Meeting title</span>
                  <input
                    value={setup.title}
                    onChange={(event) => updateSetupField("title", event.target.value)}
                    placeholder="Q2 roadmap sync"
                    className="w-full rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-900">Google Meet link</span>
                  <input
                    value={setup.meetingLink}
                    onChange={(event) => updateSetupField("meetingLink", event.target.value)}
                    placeholder="https://meet.google.com/abc-defg-hij"
                    className="w-full rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300"
                  />
                </label>
              </div>
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-900">Optional notes</span>
                <textarea
                  value={setup.notes}
                  onChange={(event) => updateSetupField("notes", event.target.value)}
                  rows={4}
                  placeholder="Agenda, attendees, or context to preserve with the session."
                  className="w-full rounded-[1.8rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-sky-300"
                />
              </label>
              {initialContext?.startTime ? (
                <div className="rounded-[1.8rem] border border-sky-100 bg-sky-50/70 p-4 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Calendar context</p>
                  <p className="mt-2 font-medium text-slate-950">
                    {initialContext.source === "google_calendar" ? "Loaded from Google Calendar" : "Meeting context loaded"}
                  </p>
                  <p className="mt-1">
                    {formatSessionDate(initialContext.startTime)}
                    {initialContext.endTime ? ` to ${formatSessionDate(initialContext.endTime)}` : ""}
                  </p>
                </div>
              ) : null}
              {setupError ? (
                <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {setupError}
                </div>
              ) : null}
              <div className="grid gap-3 rounded-[1.8rem] border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600 md:grid-cols-3">
                <div className="flex items-center gap-3">
                  <Link2 className="h-4 w-4 text-sky-600" />
                  <span>Provider locked to Google Meet</span>
                </div>
                <div className="flex items-center gap-3">
                  <NotebookPen className="h-4 w-4 text-sky-600" />
                  <span>Session metadata is saved separately</span>
                </div>
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="h-4 w-4 text-sky-600" />
                  <span>Summary output still comes from the existing engine</span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Recording Card</p>
                  <h2 className="text-xl font-semibold text-slate-950">Meeting recording</h2>
                  <p className="text-sm text-slate-600">Capture the meeting audio, then push it through transcript and summary generation.</p>
                </div>
                <Badge
                  variant={
                    audioFlowState === "completed"
                      ? "available"
                      : audioFlowState === "transcribing" || audioFlowState === "summarizing"
                        ? "pending"
                        : "neutral"
                  }
                >
                  {audioFlowState === "idle" ? "Ready" : audioFlowState.replace(/_/g, " ")}
                </Badge>
              </div>
            </div>
            <div className="space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { step: 1 as const, label: "Record" },
                  { step: 2 as const, label: "Transcript" },
                  { step: 3 as const, label: "Summary" },
                  { step: 4 as const, label: "Save" }
                ].map((item) => {
                  const state = getStepState(item.step, audioFlowState);

                  return (
                    <div
                      key={item.step}
                      className="rounded-[1.6rem] border border-slate-200 bg-slate-50/70 px-4 py-3"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                        {state === "complete" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Circle className="h-4 w-4 text-slate-400" />
                        )}
                        {item.label}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="lg" onClick={handleStartRecording} disabled={isPending || audioFlowState === "recording"}>
                  <Mic className="h-4 w-4" />
                  Start Meeting Recording
                </Button>
                <Button type="button" variant="secondary" size="lg" onClick={handleStopRecording} disabled={audioFlowState !== "recording"}>
                  <Square className="h-4 w-4" />
                  Stop Recording
                </Button>
                <Button type="button" variant="ghost" size="lg" onClick={handleGenerateTranscript} disabled={isPending || !recordedAudio || audioFlowState === "recording"}>
                  <FileText className="h-4 w-4" />
                  Retry Auto Processing
                </Button>
                <Button type="button" variant="ghost" size="lg" onClick={handleGenerateSummary} disabled={isPending || !transcript.trim() || audioFlowState === "recording"}>
                  <Sparkles className="h-4 w-4" />
                  Generate Summary
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Recording Length</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{formatRecordingDuration(recordingDurationMs)}</p>
                </div>
                <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Transcription Engine</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">
                    {getMeetingTranscriptionProviderLabel(transcriptionProvider)}
                  </p>
                </div>
                <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Summary Engine</p>
                  <p className="mt-2 text-base font-semibold text-slate-950">
                    {getMeetingProviderLabel(summarizerProvider)}
                  </p>
                </div>
              </div>
              {recordedAudio ? (
                <div className="rounded-[1.8rem] border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-3 text-sm font-medium text-slate-900">
                    <FileAudio2 className="h-4 w-4 text-sky-600" />
                    Recording ready for transcription
                  </div>
                  <audio controls className="mt-4 w-full">
                    <source src={recordedAudio.previewUrl} type={recordedAudio.blob.type} />
                  </audio>
                </div>
              ) : null}
              {recordingError ? (
                <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {recordingError}
                </div>
              ) : null}
              {workspaceError ? (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {workspaceError}
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Transcript Card</p>
                <h2 className="text-xl font-semibold text-slate-950">Transcript review</h2>
                <p className="text-sm text-slate-600">Review and adjust the transcript before you commit the final meeting summary.</p>
              </div>
            </div>
            <div className="space-y-4 p-6">
              <textarea
                value={transcript}
                onChange={(event) => {
                  setTranscript(event.target.value);
                  if (transcriptError) {
                    setTranscriptError(null);
                  }
                }}
                rows={14}
                placeholder="Your generated meeting transcript will appear here."
                className="w-full rounded-[1.8rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-7 text-slate-900 outline-none transition focus:border-sky-300"
              />
              {transcriptError ? (
                <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {transcriptError}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                <p>Only the reviewed transcript is saved back to the meeting session record.</p>
                <p>{transcript.trim().length} characters</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              {currentSummary ? (
                <SummaryCard summary={currentSummary} />
              ) : (
                <Card className="p-6">
                  <ResultState
                    title="Summary card"
                    description="Generate the meeting summary after transcript review to populate this session."
                  />
                </Card>
              )}
              {currentKeyPoints.length > 0 ? (
                <KeyPointsCard items={currentKeyPoints} />
              ) : null}
            </div>
            <aside className="space-y-6">
              {currentActionItems.length > 0 ? (
                <ActionItemsCard items={currentActionItems} />
              ) : (
                <Card className="p-6">
                  <ResultState
                    title="Action items card"
                    description="Action items will appear here when the meeting summary is generated."
                  />
                </Card>
              )}
            </aside>
          </div>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {meetingSession?.title || setup.title || "New Google Meet session"}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {meetingSession ? `Created ${formatSessionDate(meetingSession.createdAt)}` : "Session record will be created when recording starts."}
                  </p>
                </div>
                <Badge
                  variant={
                    meetingSession
                      ? getMeetingSessionStatusBadgeVariant(meetingSession.status)
                      : "neutral"
                  }
                >
                  {meetingSession ? getMeetingSessionStatusLabel(meetingSession.status) : "Draft"}
                </Badge>
              </div>
              <div className="space-y-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                  <Video className="mt-0.5 h-4 w-4 text-sky-600" />
                  <div>
                    <p className="font-medium text-slate-900">Provider</p>
                    <p>google_meet</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Link2 className="mt-0.5 h-4 w-4 text-sky-600" />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">Meeting link</p>
                    <p className="break-all">{meetingSession?.meetingLink || setup.meetingLink || "Not set yet"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 h-4 w-4 text-sky-600" />
                  <div>
                    <p className="font-medium text-slate-900">Saved output</p>
                    <p>
                      {meetingSession?.summary
                        ? "Meeting transcript, summary, key points, and action items saved."
                        : "Waiting for transcript and summary generation."}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild variant="secondary">
                  <Link href="/dashboard/meetings">View meetings</Link>
                </Button>
                {meetingSession?.status === "completed" ? (
                  <Button asChild>
                    <Link href={`/dashboard/meetings/${meetingSession.id}`}>Open Meeting</Link>
                  </Button>
                ) : null}
                {latestRun?.id ? (
                  <Button asChild variant="ghost">
                    <Link href={`/dashboard/history/${latestRun.id}`}>Open latest run</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">Meeting-oriented data model</p>
                <p className="mt-1 text-sm text-slate-500">This page persists session metadata separately from the generic tool run.</p>
              </div>
              <div className="space-y-2">
                {[
                  "title",
                  "meeting link",
                  "provider = google_meet",
                  "transcript",
                  "summary",
                  "key points",
                  "action items",
                  "createdAt"
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-slate-600">
                    <ListChecks className="h-4 w-4 text-sky-600" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
