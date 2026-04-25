"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Circle, Clipboard, Clock3, Download, FileAudio2, FileText, Mic, Pause, Play, Square, Trash2, Volume2, WandSparkles } from "lucide-react";
import { ActionItemsCard } from "@/components/tools/action-items-card";
import { KeyPointsCard } from "@/components/tools/key-points-card";
import { ResultState } from "@/components/tools/result-state";
import { SummaryCard } from "@/components/tools/summary-card";
import { ToolPageShell } from "@/components/tools/tool-page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TranscriptReviewPanel } from "@/features/tools/meeting-summarizer/components/transcript-review-panel";
import { formatMeetingRunTimestamp, getTranscriptGuidance } from "@/features/tools/meeting-summarizer/helpers";
import {
  runMeetingSummarizer,
  transcribeMeetingRecording,
  type MeetingSummarizerClientError,
  type ToolRunResponse
} from "@/features/tools/meeting-summarizer/api";
import { meetingSummarizerInputSchema } from "@/features/tools/meeting-summarizer/schema";
import type {
  MeetingAiProvider,
  MeetingSummarizerInput,
  MeetingSummarizerOutput,
  MeetingTranscriptionProvider
} from "@/features/tools/meeting-summarizer/types";
import { toolRegistry } from "@/lib/ai/tool-registry";
import { getUserMediaAudioStream } from "@/lib/media/get-user-media-audio";
import { useApiFetch } from "@/hooks/useApiFetch";

type MeetingSummarizerWorkspaceProps = {
  initialRun?: ToolRunResponse<MeetingSummarizerOutput>["run"] | null;
  initialError?: string | null;
  defaultProvider: MeetingAiProvider;
  defaultTranscriptionProvider: MeetingTranscriptionProvider;
};

type InlineErrorState = {
  message: string;
  isQuotaError: boolean;
  provider: MeetingAiProvider | null;
} | null;

type InputMode = "transcript" | "audio";

type AudioFlowState =
  | "idle"
  | "recording"
  | "recorded"
  | "transcribing"
  | "transcript_ready_for_review"
  | "summarizing"
  | "completed"
  | "error";

type RecordedAudio = {
  blob: Blob;
  file: File;
  previewUrl: string;
  durationMs: number;
};

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  function fmt(s: number) {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) { el.pause(); } else { void el.play(); }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = audioRef.current;
    if (!el) return;
    const val = Number(e.target.value);
    el.currentTime = val;
    setCurrentTime(val);
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6c63ff] text-white transition hover:bg-[#5b52e0]"
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-px" />}
      </button>
      <span className="w-10 shrink-0 text-xs tabular-nums text-slate-500">{fmt(currentTime)}</span>
      <div className="relative flex-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-[#6c63ff] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={currentTime}
          onChange={handleSeek}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">{fmt(duration)}</span>
      <Volume2 className="h-4 w-4 shrink-0 text-slate-400" />
    </div>
  );
}

function MeetingSummarizerLoadingState(props: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="space-y-4">
      <ResultState
        icon="loading"
        title={props.title || "Generating summary"}
        description={props.description || "Analyzing the transcript, extracting decisions, and structuring next steps."}
      />
      {[0, 1, 2].map((index) => (
        <Card key={index} className="p-5">
          <div className="space-y-4 animate-pulse">
            <div className="space-y-2">
              <div className="h-5 w-32 rounded-full bg-slate-200" />
              <div className="h-4 w-52 rounded-full bg-slate-100" />
            </div>
            <div className="space-y-3">
              <div className="h-20 rounded-2xl bg-slate-100" />
              <div className="h-16 rounded-2xl bg-slate-100" />
              {index === 2 ? <div className="h-16 rounded-2xl bg-slate-100" /> : null}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function MeetingSummarizerWorkspace({
  initialRun = null,
  initialError = null,
  defaultProvider,
  defaultTranscriptionProvider
}: MeetingSummarizerWorkspaceProps) {
  const tool = toolRegistry["meeting-summarizer"];
  const apiFetch = useApiFetch();
  const [latestRun, setLatestRun] = useState(initialRun);
  const [serverError, setServerError] = useState<InlineErrorState>(
    initialError
      ? {
          message: initialError,
          isQuotaError: false,
          provider: null
        }
      : null
  );
  const [isPending, startTransition] = useTransition();
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const [providerToastVisible, setProviderToastVisible] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("transcript");
  const [audioFlowState, setAudioFlowState] = useState<AudioFlowState>("idle");
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudio | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [reviewTranscript, setReviewTranscript] = useState("");
  const [originalTranscript, setOriginalTranscript] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [transcriptionProvider, setTranscriptionProvider] = useState<MeetingTranscriptionProvider>(
    defaultTranscriptionProvider
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const form = useForm<MeetingSummarizerInput>({
    resolver: zodResolver(meetingSummarizerInputSchema),
    defaultValues: {
      inputType: "transcript",
      provider:
        initialRun?.inputJson?.provider &&
        (initialRun.inputJson.provider === "openai" || initialRun.inputJson.provider === "gemini")
          ? initialRun.inputJson.provider
          : defaultProvider,
      transcript: ""
    }
  });
  const { ref: transcriptFieldRef, ...transcriptField } = form.register("transcript");

  const transcript = form.watch("transcript") ?? "";
  const provider = form.watch("provider");
  const guidance = getTranscriptGuidance(transcript);
  const characterCount = transcript.trim().length;

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [transcript]);

  useEffect(() => {
    if (!copyToastVisible && !providerToastVisible) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopyToastVisible(false);
      setProviderToastVisible(false);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [copyToastVisible, providerToastVisible]);

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

  function formatRecordingDuration(durationMs: number) {
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

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

  function resetRecordingState() {
    clearRecordingTimer();
    stopMediaStream();
    if (recordedAudio?.previewUrl) {
      URL.revokeObjectURL(recordedAudio.previewUrl);
    }
    recordingChunksRef.current = [];
    mediaRecorderRef.current = null;
    recordingStartedAtRef.current = null;
    setRecordingDurationMs(0);
    setRecordedAudio(null);
    setAudioFlowState("idle");
    setRecordingError(null);
    setAudioNotice(null);
    setReviewTranscript("");
    setOriginalTranscript("");
    setReviewError(null);
  }

  function resetWorkspace() {
    setLatestRun(null);
    setServerError(null);
    setCopyToastVisible(false);
    setProviderToastVisible(false);
    setAudioNotice(null);
    form.reset({
      inputType: "transcript",
      provider: form.getValues("provider"),
      transcript: ""
    });
    resetRecordingState();
  }

  async function handleCopySummary() {
    if (!latestRun?.outputJson.summary) {
      return;
    }

    await navigator.clipboard.writeText(latestRun.outputJson.summary);
    setCopyToastVisible(true);
  }

  function handleDownloadNotes() {
    if (!latestRun?.outputJson) {
      return;
    }

    const transcriptValue =
      latestRun.inputJson?.transcript && typeof latestRun.inputJson.transcript === "string"
        ? latestRun.inputJson.transcript
        : "";
    const markdown = [
      `# ${latestRun.title || "Meeting Summary"}`,
      "",
      `- Generated: ${formatMeetingRunTimestamp(latestRun.createdAt)}`,
      "",
      "## Summary",
      latestRun.outputJson.summary,
      "",
      "## Key Points",
      ...latestRun.outputJson.key_points.map((item) => `- ${item}`),
      "",
      "## Action Items",
      ...(latestRun.outputJson.action_items.length > 0
        ? latestRun.outputJson.action_items.map(
            (item) => `- ${item.task} | Owner: ${item.owner || "Unspecified"} | Deadline: ${item.deadline || "Unspecified"}`
          )
        : ["- No clear action items identified."]),
      "",
      "## Transcript",
      transcriptValue || "No transcript saved."
    ].join("\n");

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(latestRun.title || "meeting-summary").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleProviderSelection(nextProvider: MeetingAiProvider, disabled?: boolean) {
    if (disabled) {
      setProviderToastVisible(true);
      return;
    }

    form.setValue("provider", nextProvider, { shouldDirty: true, shouldValidate: true });
  }

  function handleAudioModeSelection(modeOption: InputMode) {
    setInputMode(modeOption);
    setServerError(null);
    setAudioNotice(null);
    setRecordingError(null);
    setReviewError(null);
  }

  function handleTranscriptReviewChange(value: string) {
    setReviewTranscript(value);
    if (reviewError && value.trim().length > 0) {
      setReviewError(null);
    }
  }

  function getAudioStepState(step: 1 | 2 | 3) {
    switch (step) {
      case 1:
        return audioFlowState === "idle" || audioFlowState === "recording" || audioFlowState === "recorded" || audioFlowState === "transcribing"
          ? "current"
          : "complete";
      case 2:
        if (audioFlowState === "transcript_ready_for_review") {
          return "current";
        }
        return audioFlowState === "summarizing" || audioFlowState === "completed" ? "complete" : "upcoming";
      case 3:
        return audioFlowState === "summarizing" || audioFlowState === "completed" ? "current" : "upcoming";
    }
  }

  async function handleStartRecording() {
    try {
      resetRecordingState();
      const stream = await getUserMediaAudioStream();
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
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      setRecordingError(null);
      setAudioNotice(null);
      setReviewError(null);
      setAudioFlowState("recording");
      setRecordingDurationMs(0);

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

        setRecordedAudio({
          blob,
          file,
          previewUrl,
          durationMs
        });
        setRecordingDurationMs(durationMs);
        setAudioFlowState("recorded");
        clearRecordingTimer();
        stopMediaStream();
      };

      mediaRecorder.start();
      recordingTimerRef.current = window.setInterval(() => {
        if (!recordingStartedAtRef.current) {
          return;
        }

        setRecordingDurationMs(Date.now() - recordingStartedAtRef.current);
      }, 250);
    } catch (error) {
      resetRecordingState();
      setRecordingError(
        error instanceof Error
          ? error.message
          : "Microphone access is required to record audio."
      );
      setAudioFlowState("error");
    }
  }

  function handleStopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  function handleTranscribeRecording() {
    if (!recordedAudio) {
      setRecordingError("Please record audio before requesting transcription.");
      setAudioFlowState("error");
      return;
    }

    setServerError(null);
    setRecordingError(null);
    setAudioNotice(null);
    setReviewError(null);

    startTransition(async () => {
      try {
        setAudioFlowState("transcribing");
        const transcription = await transcribeMeetingRecording(recordedAudio.file, transcriptionProvider, apiFetch);
        const transcriptText = transcription.transcript.trim();

        if (!transcriptText) {
          setRecordingError("Transcript was empty. Please try recording or transcribing again.");
          setAudioFlowState("error");
          return;
        }

        setOriginalTranscript(transcription.transcript);
        setReviewTranscript(transcription.transcript);
        setAudioNotice("Transcript generated. Review and correct it before creating the final summary.");
        setAudioFlowState("transcript_ready_for_review");
      } catch (error) {
        setRecordingError(
          error instanceof Error
            ? error.message
            : "Failed to generate transcript."
        );
        setAudioFlowState("error");
      }
    });
  }

  function handleSummarizeReviewedTranscript() {
    if (!recordedAudio) {
      setRecordingError("Please record audio before generating a summary.");
      setAudioFlowState("error");
      return;
    }

    if (!reviewTranscript.trim()) {
      setReviewError("Transcript cannot be empty. Add or restore transcript text before continuing.");
      return;
    }

    setServerError(null);
    setRecordingError(null);
    setAudioNotice(null);
    setReviewError(null);

    startTransition(async () => {
      try {
        setAudioFlowState("summarizing");
        const finalTranscript = reviewTranscript.trim();
        const summaryResponse = await runMeetingSummarizer({
          inputType: "audio",
          provider: form.getValues("provider"),
          transcriptionProvider,
          audioFileName: recordedAudio.file.name,
          audioMimeType: recordedAudio.file.type,
          originalTranscript,
          transcript: finalTranscript
        });

        form.reset({
          inputType: "audio",
          provider: form.getValues("provider"),
          transcriptionProvider,
          audioFileName: recordedAudio.file.name,
          audioMimeType: recordedAudio.file.type,
          originalTranscript,
          transcript: finalTranscript
        });
        setReviewTranscript(finalTranscript);
        setLatestRun(summaryResponse.run);
        setAudioFlowState("completed");
      } catch (error) {
        setRecordingError(
          error instanceof Error
            ? error.message
            : "Failed to generate summary."
        );
        setAudioNotice("Transcript review was preserved. Update it if needed and try summarizing again.");
        setAudioFlowState("error");
      }
    });
  }

  function onSubmit(values: MeetingSummarizerInput) {
    setServerError(null);

    startTransition(async () => {
      try {
        const response = await runMeetingSummarizer({
          ...values,
          inputType: "transcript"
        });
        setLatestRun(response.run);
      } catch (error) {
        const clientError = error as MeetingSummarizerClientError;
        setServerError({
          message:
            error instanceof Error ? error.message : "Something went wrong while generating the summary.",
          isQuotaError: Boolean(clientError?.isQuotaError),
          provider: clientError?.provider ?? values.provider
        });
      }
    });
  }

  return (
    <>
      <ToolPageShell
        tool={tool}
        aside={
          <>
            {isPending ? (
              <MeetingSummarizerLoadingState
                title={inputMode === "audio" && audioFlowState === "transcribing" ? "Generating transcript..." : "Generating summary..."}
                description={
                  inputMode === "audio" && audioFlowState === "transcribing"
                    ? "Converting the recording into an editable transcript for review."
                    : "Analyzing the transcript, extracting decisions, and structuring next steps."
                }
              />
            ) : latestRun?.outputJson ? (
              <>
                <Card className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{latestRun.title || "Meeting Summary"}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Generated {formatMeetingRunTimestamp(latestRun.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="available">Saved</Badge>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-[1.4rem] border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Generated At</p>
                      <p className="mt-1 font-medium text-slate-900">{formatMeetingRunTimestamp(latestRun.createdAt)}</p>
                    </div>
                  </div>
                  {typeof latestRun.inputJson?.transcript === "string" ? (
                    <div className="mt-4 rounded-[1.4rem] border border-slate-200 bg-slate-50/80 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Transcript</p>
                      <div className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-slate-700">
                        {latestRun.inputJson.transcript}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" variant="secondary" onClick={resetWorkspace}>
                        New Summary
                      </Button>
                      <Button asChild type="button" variant="ghost">
                        <Link href="/dashboard/history">View History</Link>
                      </Button>
                    </div>
                  </div>
                </Card>
                <SummaryCard
                  summary={latestRun.outputJson.summary}
                  actions={
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={handleCopySummary}>
                        <Clipboard className="h-4 w-4" />
                        Copy Summary
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={handleDownloadNotes}>
                        <Download className="h-4 w-4" />
                        Download Notes
                      </Button>
                    </div>
                  }
                />
                <KeyPointsCard items={latestRun.outputJson.key_points} />
                <ActionItemsCard items={latestRun.outputJson.action_items} />
              </>
            ) : serverError ? (
              <ResultState
                icon="error"
                title={serverError.isQuotaError ? "AI service quota exceeded" : "Generation failed"}
                description={serverError.message}
              />
            ) : (
              <ResultState
                title="Results appear here"
                description="Generate a summary to see structured output for the meeting, including key points and action items."
              />
            )}
          </>
        }
      >
        <Card className="p-6">
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-3 rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2">
              {[
                {
                  value: "transcript" as const,
                  title: "Paste Transcript",
                  description: "Paste notes or a transcript and summarize immediately.",
                  icon: FileText
                },
                {
                  value: "audio" as const,
                  title: "Record Audio",
                  description: "Capture a meeting clip locally and prepare it for transcription.",
                  icon: FileAudio2
                }
              ].map((modeOption) => {
                const isSelected = inputMode === modeOption.value;
                const Icon = modeOption.icon;

                return (
                  <button
                    key={modeOption.value}
                    type="button"
                    onClick={() => handleAudioModeSelection(modeOption.value)}
                    className={
                      isSelected
                        ? "rounded-[1.35rem] border border-[#c4b5fd] bg-white px-4 py-4 text-left shadow-sm transition-all"
                        : "rounded-[1.35rem] border border-transparent bg-transparent px-4 py-4 text-left transition-all hover:border-slate-200 hover:bg-white/80"
                    }
                  >
                    <div className="flex items-start gap-3">
                      <div className={isSelected ? "rounded-2xl bg-[#f5f3ff] p-3 text-[#6c63ff]" : "rounded-2xl bg-white p-3 text-slate-500"}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-950">{modeOption.title}</p>
                        <p className="text-sm leading-6 text-slate-500">{modeOption.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-4 rounded-[1.75rem] border border-[#ede9fe] bg-gradient-to-br from-[#f5f3ff] to-white p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-950">Paste a meeting transcript and generate a saved structured summary.</p>
                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                  {inputMode === "transcript"
                    ? "The model returns a concise recap, key discussion points, and action items with owners and deadlines only when they are clearly present."
                    : "Record a meeting snippet, generate a transcript, review it, and then create the final saved summary."}
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white bg-white/90 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {inputMode === "transcript" ? "Run history enabled" : "Review before saving"}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor={inputMode === "transcript" ? "transcript" : "recording-panel"} className="text-sm font-medium text-slate-900">
                  {inputMode === "transcript" ? "Meeting transcript" : "Meeting recording"}
                </label>
                <p className="mt-1 text-sm text-slate-500">
                  {inputMode === "transcript"
                    ? "Paste the full conversation or notes. Richer input leads to better summaries, key points, and action items."
                    : "Use your microphone to capture audio locally in the browser, then review the generated transcript before the summary is saved."}
                </p>
              </div>

              {inputMode === "transcript" ? (
                <>
                  <div className="flex items-center justify-end">
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                      {characterCount} chars
                    </div>
                  </div>
                  <textarea
                    id="transcript"
                    ref={(element) => {
                      textareaRef.current = element;
                      transcriptFieldRef(element);
                    }}
                    rows={8}
                    placeholder={"Paste a meeting transcript here.\n\nHelpful format:\nRahul: I'll send the revised deck by Friday.\nMaya: I can take the customer follow-up next week.\nArjun: Let's recap the final action items before we close."}
                    className="w-full resize-none overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-50/80 px-5 py-4 text-sm leading-7 text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#c4b5fd] disabled:cursor-not-allowed disabled:opacity-80"
                    disabled={isPending}
                    {...transcriptField}
                  />
                </>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 rounded-[1.75rem] border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-3">
                    {[
                      { step: 1 as const, title: "Record audio" },
                      { step: 2 as const, title: "Review transcript" },
                      { step: 3 as const, title: "View summary" }
                    ].map((stepItem) => {
                      const state = getAudioStepState(stepItem.step);

                      return (
                        <div
                          key={stepItem.step}
                          className={
                            state === "current"
                              ? "rounded-[1.35rem] border border-[#c4b5fd] bg-white px-4 py-4 shadow-sm"
                              : state === "complete"
                                ? "rounded-[1.35rem] border border-emerald-200 bg-emerald-50/70 px-4 py-4"
                                : "rounded-[1.35rem] border border-transparent bg-white/70 px-4 py-4"
                          }
                        >
                          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Step {stepItem.step}</p>
                          <p className="mt-2 text-sm font-semibold text-slate-950">{stepItem.title}</p>
                        </div>
                      );
                    })}
                  </div>

                  <Card id="recording-panel" className={audioFlowState === "recording" ? "border-rose-200 bg-rose-50/70 p-5" : "p-5"}>
                    <div className="space-y-5">

                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div className={audioFlowState === "recording" ? "rounded-2xl bg-rose-100 p-3 text-rose-700" : "rounded-2xl bg-slate-100 p-3 text-slate-500"}>
                            {audioFlowState === "recording" ? <Circle className="h-5 w-5 animate-pulse fill-current" /> : <Mic className="h-5 w-5" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-950">
                              {audioFlowState === "recording"
                                ? "Recording in progress"
                                : recordedAudio
                                  ? "Recording ready"
                                  : "Ready to record"}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {audioFlowState === "recording"
                                ? "Microphone capture is active. Stop when you have the segment you want."
                                : recordedAudio
                                  ? "Preview the audio, generate the transcript, then review it before creating the summary."
                                  : "Start recording to capture audio directly from your browser."}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold tabular-nums text-slate-700">
                          {formatRecordingDuration(recordingDurationMs)}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {audioFlowState !== "recording" && audioFlowState !== "transcript_ready_for_review" && audioFlowState !== "summarizing" && audioFlowState !== "completed" ? (
                          <Button type="button" onClick={handleStartRecording} disabled={isPending}>
                            <Mic className="h-4 w-4" />
                            Start Recording
                          </Button>
                        ) : audioFlowState === "recording" ? (
                          <Button type="button" variant="secondary" onClick={handleStopRecording}>
                            <Square className="h-4 w-4" />
                            Stop Recording
                          </Button>
                        ) : null}
                        {recordedAudio && audioFlowState !== "transcript_ready_for_review" && audioFlowState !== "summarizing" && audioFlowState !== "completed" ? (
                          <Button type="button" variant="ghost" onClick={resetRecordingState} disabled={isPending}>
                            <Trash2 className="h-4 w-4" />
                            Discard Recording
                          </Button>
                        ) : null}
                        {audioFlowState !== "transcript_ready_for_review" && audioFlowState !== "summarizing" && audioFlowState !== "completed" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleTranscribeRecording}
                            disabled={!recordedAudio || audioFlowState === "recording" || audioFlowState === "transcribing" || isPending}
                            className="min-w-[12rem] whitespace-nowrap px-5"
                          >
                            <WandSparkles className="h-4 w-4" />
                            {audioFlowState === "transcribing" ? "Generating transcript..." : "Transcribe"}
                          </Button>
                        ) : null}
                      </div>

                      {recordedAudio ? (
                        <div className="rounded-[1.4rem] border border-slate-200 bg-white/90 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-950">Audio Preview</p>
                              <p className="mt-1 text-sm text-slate-500">
                                {recordedAudio.file.name} · {formatRecordingDuration(recordedAudio.durationMs)}
                              </p>
                            </div>
                          </div>
                          <AudioPlayer src={recordedAudio.previewUrl} />
                        </div>
                      ) : null}
                    </div>
                  </Card>

                  {(audioFlowState === "transcript_ready_for_review" ||
                    audioFlowState === "summarizing" ||
                    audioFlowState === "completed" ||
                    (audioFlowState === "error" && reviewTranscript)) ? (
                    <TranscriptReviewPanel
                      value={reviewTranscript}
                      onChange={handleTranscriptReviewChange}
                      onSummarize={handleSummarizeReviewedTranscript}
                      onRetranscribe={handleTranscribeRecording}
                      onDiscard={resetRecordingState}
                      disabled={audioFlowState === "summarizing" || isPending}
                      error={reviewError}
                      helperText="Keep names, decisions, owners, and deadlines accurate before generating the final summary."
                      isSummarizing={audioFlowState === "summarizing"}
                    />
                  ) : null}
                </div>
              )}

              <div className="flex items-start justify-between gap-4">
                <p className="text-sm text-slate-500">
                  {inputMode === "transcript"
                    ? guidance
                    : audioFlowState === "transcript_ready_for_review" || audioFlowState === "summarizing" || audioFlowState === "completed"
                      ? "Review the transcript carefully before generating the final summary. The saved run will use the edited version."
                      : "Record audio, then review the transcript before creating the final summary."}
                </p>
                {inputMode === "transcript" && (form.formState.errors.transcript || form.formState.errors.provider) ? (
                  <div className="flex items-center gap-2 text-sm text-rose-600">
                    <AlertTriangle className="h-4 w-4" />
                    {form.formState.errors.transcript?.message || form.formState.errors.provider?.message}
                  </div>
                ) : recordingError ? (
                  <div className="flex items-center gap-2 text-sm text-rose-600">
                    <AlertTriangle className="h-4 w-4" />
                    {recordingError}
                  </div>
                ) : null}
              </div>
            </div>

            {audioNotice ? (
              <div className="rounded-3xl border border-[#ede9fe] bg-[#f5f3ff] px-4 py-4 text-sm text-[#4c1d95]">
                <div className="flex items-start gap-3">
                  <FileAudio2 className="mt-0.5 h-4 w-4 shrink-0 text-[#6c63ff]" />
                  <div className="space-y-1">
                    <p className="font-medium">
                      {audioFlowState === "transcript_ready_for_review" || audioFlowState === "completed"
                        ? "Review transcript before summarizing"
                        : "Transcription is coming next"}
                    </p>
                    <p>{audioNotice}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {serverError && inputMode === "transcript" ? (
              <div
                className={
                  serverError.isQuotaError
                    ? "rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800"
                    : "rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                }
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">
                      {serverError.isQuotaError
                        ? "AI service quota exceeded"
                        : "Unable to generate summary"}
                    </p>
                    <p>{serverError.message}</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {inputMode === "transcript"
                    ? "Output is stored in run history after successful generation."
                    : "Only the final reviewed transcript is saved when you generate the summary."}
                </div>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4" />
                  {inputMode === "transcript"
                    ? "JSON output is validated before it is shown."
                    : audioFlowState === "transcribing"
                      ? "Generating transcript..."
                      : audioFlowState === "summarizing"
                        ? "Generating summary..."
                        : "Transcript review stays editable until you confirm the final summary."}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {latestRun ? (
                  <Button type="button" variant="secondary" onClick={resetWorkspace} disabled={isPending}>
                    New Summary
                  </Button>
                ) : null}
                {inputMode === "transcript" ? (
                  <Button type="submit" size="lg" disabled={isPending}>
                    <WandSparkles className="h-4 w-4" />
                    {isPending ? "Generating..." : "Generate Summary"}
                  </Button>
                ) : null}
              </div>
            </div>
          </form>
        </Card>
      </ToolPageShell>
      {copyToastVisible ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-full border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-emerald-700 shadow-soft">
          Summary copied to clipboard
        </div>
      ) : null}
      {providerToastVisible ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-[1.4rem] border border-amber-200 bg-white px-4 py-3 text-sm shadow-soft">
          <p className="font-medium text-slate-900">OpenAI temporarily unavailable</p>
          <p className="mt-1 text-slate-600">OpenAI support will be enabled soon. Please use Gemini for now.</p>
        </div>
      ) : null}
    </>
  );
}
