"use client";

import React, { type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Mic,
  Send,
  Sparkles,
  Square,
  Trash2,
  TriangleAlert
} from "lucide-react";
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
import { ShareToWorkspaceButton } from "@/features/meetings/components/share-to-workspace-button";
import { isCalendarMeetingId } from "@/features/meetings/ids";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { MeetingShareModal } from "@/features/meetings/components/meeting-share-modal";
import { clientApiFetch } from "@/lib/api-client";
import { generateMeetingPdf } from "@/features/meetings/utils/generate-meeting-pdf";

type MeetingDetailProps = { meetingId: string };
type DetailTab = "notes" | "transcript" | "insights";
type TranscriptBlock = { speaker: string; text: string; timestamp: string; order: number; wordCount: number };

const tabs: Array<{ id: DetailTab; label: string; icon: string }> = [
  { id: "notes", label: "Overview", icon: "description" },
  { id: "transcript", label: "Transcript", icon: "article" },
  { id: "insights", label: "Insights", icon: "insights" },
];

const SPEAKER_COLORS = ["#6C3FF5", "#16a34a", "#2563eb", "#ca8a04", "#dc2626", "#0891b2"];
const WORD_COLORS = ["#6C3FF5", "#16a34a", "#2563eb", "#ca8a04", "#dc2626", "#0891b2", "#7c3aed", "#059669", "#d97706"];

// ── Helper functions ──────────────────────────────────────────────────────────

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "Unknown";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function formatOffset(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function getInitials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() || "").join("");
}

function getPriorityTone(priority: string | null | undefined) {
  switch ((priority || "Medium").toLowerCase()) {
    case "high": return { bg: "#FCE8E6", color: "#C5221F" };
    case "low": return { bg: "#E6F4EA", color: "#137333" };
    default: return { bg: "#FEF7E0", color: "#B06000" };
  }
}

function getPlatformFromUrl(url: string | null | undefined) {
  if (!url) return "google";
  const n = url.toLowerCase();
  if (n.includes("zoom.us") || n.includes("zoom.com")) return "zoom";
  if (n.includes("teams.microsoft.com") || n.includes("teams.live.com")) return "teams";
  return "google";
}

function getPlatformConfig(platform: string) {
  const map: Record<string, { name: string; color: string; bg: string; icon: string }> = {
    google: { name: "Google Meet", color: "#00AC47", bg: "#E8F5E9", icon: "videocam" },
    zoom: { name: "Zoom", color: "#2D8CFF", bg: "#E3F2FD", icon: "video_call" },
    teams: { name: "Microsoft Teams", color: "#6264A7", bg: "#EDE9FE", icon: "groups" },
    unknown: { name: "Unknown", color: "#5F6368", bg: "#F1F3F4", icon: "videocam" },
  };
  return map[platform] ?? map.unknown;
}

function getStatusMessage(status: MeetingDetailRecord["status"]) {
  switch (status) {
    case "waiting_for_join": return "Preparing to join the meeting in a separate browser.";
    case "waiting_for_admission": return "Waiting for the meeting host to admit the Artivaa bot.";
    case "capturing": return "Recording in progress. Audio is being captured for transcription.";
    case "processing": return "Processing the saved recording and preparing the transcript.";
    case "summarizing": return "Generating the structured Artivaa summary and action items.";
    case "failed": return "The last recording run failed before the report finished.";
    case "completed": return "Meeting report is ready.";
    default: return "Scheduled and ready to start.";
  }
}

function getFailureMessage(errorCode: string | null, fallback: string | null) {
  const msgs: Record<string, string> = {
    unsupported_platform: "This meeting platform is not supported yet.",
    meet_access_denied: "Bot cannot access this meeting. Run: npm run setup:bot-profile",
    invalid_meeting_link: "Meeting link is invalid or expired.",
    no_audio_captured: "No audio was captured. Check MEETING_AUDIO_SOURCE setting.",
    bot_kicked: "Bot was removed from the meeting.",
    transcription_failed: "Transcription failed. Audio may be too short.",
    empty_transcript: "Transcript was empty. Audio may be silence — check MEETING_AUDIO_SOURCE.",
    summary_failed: "Summary generation failed.",
    host_admission_required: "Bot is waiting to be admitted by the meeting host.",
    default: "An unexpected error occurred. Check the server logs.",
  };
  return (errorCode && msgs[errorCode]) ? msgs[errorCode] : (fallback || msgs.default);
}

function renderStatusBadge(status: MeetingDetailRecord["status"]) {
  return (
    <Badge variant={getMeetingDetailStatusBadgeVariant(status)}>
      {status === "capturing" ? <span className="pulse-dot" aria-hidden="true" /> : null}
      {getMeetingDetailStatusLabel(status)}
    </Badge>
  );
}

function parseTranscriptBlocks(transcript: string | null, durationSeconds: number | null): TranscriptBlock[] {
  if (!transcript?.trim()) return [];
  const paragraphs = transcript.split(/\n\s*\n/).map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean);
  const speakerRegex = /^([A-Z][A-Za-z.' -]{1,40}):\s*(.+)$/;
  const estimatedDuration = durationSeconds && durationSeconds > 0 ? durationSeconds : Math.max(60, paragraphs.length * 45);
  let fallbackSpeaker = "Speaker 1";
  return paragraphs.map((paragraph, index) => {
    const match = paragraph.match(speakerRegex);
    const speaker = match?.[1]?.trim() || fallbackSpeaker;
    const text = match?.[2]?.trim() || paragraph;
    if (!match && index > 0) fallbackSpeaker = `Speaker ${Math.min(index + 1, 6)}`;
    return {
      speaker, text, order: index,
      timestamp: formatOffset(Math.round((estimatedDuration / Math.max(paragraphs.length, 1)) * index)),
      wordCount: text.split(/\s+/).filter(Boolean).length,
    };
  });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function MeetingDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded-xl bg-[#F1F3F4]" />
      <div className="h-24 animate-pulse rounded-xl bg-white border border-[#DADCE0]" />
      <div className="h-64 animate-pulse rounded-xl bg-white border border-[#DADCE0]" />
      <div className="h-48 animate-pulse rounded-xl bg-white border border-[#DADCE0]" />
    </div>
  );
}

// ── AudioPlayer ───────────────────────────────────────────────────────────────

function AudioPlayer({ url, duration }: { url: string; duration: number | null | undefined }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    const fetchFn = url.startsWith("/api/") ? clientApiFetch(url) : Promise.resolve(fetch(url));
    fetchFn
      .then((res) => { if (res.status === 404) { setNotFound(true); return null; } if (!res.ok) throw new Error(`${res.status}`); return res.blob(); })
      .then((blob) => { if (!blob) return; objectUrl = URL.createObjectURL(blob); setBlobUrl(objectUrl); })
      .catch(() => setNotFound(true));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);

  if (notFound) {
    return (
      <div className="rounded-xl border border-dashed border-[#DADCE0] bg-[#FAFAFA] p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-[#9AA0A6] text-[20px]">music_off</span>
          <p className="text-sm font-semibold text-[#5F6368]">Meeting Recording</p>
        </div>
        <p className="text-xs text-[#9AA0A6]">
          Recording not available yet. If the meeting just finished, wait a minute and refresh.
          Otherwise ensure the bot uploaded the file (BOT_UPLOAD_SECRET + EXPRESS_API_URL on the bot).
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-[#6C3FF5] text-[20px]">music_note</span>
        <p className="text-sm font-semibold text-[#202124]">Meeting Recording</p>
        {duration && <span className="ml-auto text-xs text-[#5F6368]">{formatDuration(duration)}</span>}
      </div>
      {blobUrl ? (
        <audio controls className="w-full" src={blobUrl}>Your browser does not support audio.</audio>
      ) : (
        <div className="flex items-center gap-2 text-xs text-[#9AA0A6]">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading recording…
        </div>
      )}
    </div>
  );
}

// ── ScoreCard (Insights tab) ──────────────────────────────────────────────────

function ScoreCard({ label, value, max, color, isText, subtitle }: {
  label: string; value: string | number | null | undefined; max?: number;
  color: string; isText?: boolean; subtitle?: string;
}) {
  const numericValue = typeof value === "number" ? value : 0;
  return (
    <div className="rounded-xl border border-[#DADCE0] bg-white p-5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6368] mb-2">{label}</p>
      {isText ? (
        <p className="text-xl font-bold capitalize" style={{ color }}>{String(value || "Unknown")}</p>
      ) : (
        <>
          <p className="text-3xl font-bold" style={{ color }}>
            {max ? `${numericValue}` : typeof value === "number" ? value.toLocaleString() : String(value || 0)}
          </p>
          {max ? (
            <div className="mt-2 h-1.5 w-full rounded-full bg-[#F1F3F4]">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, (numericValue / max) * 100))}%`, background: color }} />
            </div>
          ) : null}
        </>
      )}
      {subtitle && <p className="mt-1 text-xs text-[#9AA0A6]">{subtitle}</p>}
    </div>
  );
}

// ── InsightsCard ──────────────────────────────────────────────────────────────

function InsightsCard({ title, icon, children }: { title: string; icon?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2 mb-4">
        {icon && <span className="material-symbols-outlined text-[#6C3FF5] text-[18px]">{icon}</span>}
        <h3 className="text-sm font-semibold text-[#202124]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ── MeetingProcessedContent ───────────────────────────────────────────────────

type MeetingProcessedContentProps = {
  meeting: MeetingDetailRecord;
  speakerStats: Array<{ speaker: string; words: number; percentage: number }>;
  shareOpen: boolean;
  setShareOpen: (open: boolean) => void;
  copyFeedback: string | null;
  handleCopyActionItemsAsMarkdown: () => void;
  handleCopyActionItemsAsText: () => void;
};

function MeetingProcessedContent({
  meeting, speakerStats, shareOpen, setShareOpen, copyFeedback,
  handleCopyActionItemsAsMarkdown, handleCopyActionItemsAsText,
}: MeetingProcessedContentProps) {
  return (
    <div className="space-y-5">
      {/* AI Summary */}
      <div className="rounded-xl border-l-4 border-l-[#6C3FF5] border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#6C3FF5]" />
            <p className="text-sm font-semibold text-[#202124]">AI Meeting Summary</p>
          </div>
          {meeting.summary && (
            <button type="button" onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#6C3FF5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#5B2FE0] transition-colors">
              <Send className="h-3 w-3" /> Share Summary
            </button>
          )}
        </div>
        <p className="text-sm leading-7 text-[#374151]">
          {meeting.summary || "No summary is available yet for this meeting."}
        </p>
      </div>

      {/* Two-column: Key Discussion Points + Key Decisions */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Key Points */}
        <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <p className="text-sm font-semibold text-[#202124] mb-3">Key Discussion Points</p>
          {(meeting.keyPoints ?? []).length === 0 ? (
            <p className="text-xs text-[#9AA0A6]">No key points captured.</p>
          ) : (
            <div className="space-y-2">
              {(meeting.keyPoints ?? []).slice(0, 5).map((point, i) => (
                <div key={`kp-${i}`} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[11px] font-bold text-[#6C3FF5]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-relaxed text-[#374151]">{point}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Key Decisions */}
        <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <p className="text-sm font-semibold text-[#202124] mb-3">Key Decisions</p>
          {(meeting.keyDecisions ?? []).length === 0 ? (
            <p className="text-xs text-[#9AA0A6]">No key decisions captured.</p>
          ) : (
            <div className="space-y-2">
              {(meeting.keyDecisions ?? []).map((decision, i) => (
                <div key={`kd-${i}`} className="flex items-start gap-2 rounded-lg bg-[#F8F9FA] px-3 py-2.5">
                  <span className="material-symbols-outlined text-[#6C3FF5] text-[16px] mt-0.5 shrink-0">check_circle</span>
                  <p className="text-sm leading-relaxed text-[#374151]">{decision}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Risks & Blockers */}
      {(meeting.risksAndBlockers ?? []).length > 0 && (
        <div className="rounded-xl border-l-4 border-l-[#B06000] border border-[#FEF7E0] bg-[#FFFDF5] p-5">
          <div className="flex items-center gap-2 mb-3">
            <TriangleAlert className="h-4 w-4 text-[#B06000]" />
            <p className="text-sm font-semibold text-[#B06000]">Risks &amp; Blockers</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(meeting.risksAndBlockers ?? []).map((item, i) => (
              <div key={`rb-${i}`} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#B06000]" />
                <p className="text-sm text-[#713f12]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Items */}
      <div className="rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-[#DADCE0] bg-[#F8F9FA]">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-[#6C3FF5]" />
            <p className="text-sm font-semibold text-[#202124]">Action Items</p>
            {(meeting.actionItems ?? []).length > 0 && (
              <span className="rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[11px] font-bold text-[#6C3FF5]">
                {(meeting.actionItems ?? []).length}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleCopyActionItemsAsMarkdown}
              className="rounded-lg border border-[#DADCE0] bg-white px-3 py-1.5 text-xs font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
              Copy as Markdown
            </button>
            <button type="button" onClick={handleCopyActionItemsAsText}
              className="rounded-lg border border-[#DADCE0] bg-white px-3 py-1.5 text-xs font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
              Copy as Text
            </button>
          </div>
        </div>
        {copyFeedback && (
          <div className="px-5 py-2 bg-[#E6F4EA] text-xs font-semibold text-[#137333]">{copyFeedback}</div>
        )}
        {(meeting.actionItems ?? []).length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[#9AA0A6]">No action items were saved for this meeting.</div>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#F8F9FA] border-b border-[#DADCE0]">
              <tr>
                {["Task", "Owner", "Due Date", "Priority", "Action"].map((h) => (
                  <th key={h} className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#5F6368]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F3F4]">
              {(meeting.actionItems ?? []).map((item, index) => {
                const pt = getPriorityTone(item.priority);
                return (
                  <tr key={`ai-${index}`} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-5 py-3.5 text-sm text-[#202124] max-w-[240px]">
                      <p className="line-clamp-2">{item.task}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[11px] font-bold text-[#6C3FF5]">
                          {getInitials(item.owner || speakerStats[0]?.speaker || "U")}
                        </div>
                        <span className="text-sm text-[#5F6368]">{item.owner || speakerStats[0]?.speaker || "Unassigned"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-[#5F6368]">{item.dueDate || item.deadline || "Not specified"}</td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
                        style={{ background: pt.bg, color: pt.color }}>
                        {item.priority || "Medium"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <button type="button" className="rounded-lg p-1.5 text-[#9AA0A6] hover:bg-[#F1F3F4] hover:text-[#5F6368] transition-colors">
                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── CalendarEventDetail ───────────────────────────────────────────────────────

export function CalendarEventDetail({ encodedId }: { encodedId: string }) {
  const router = useRouter();
  const [event, setEvent] = useState<{
    id: string; title: string; startTime: string; endTime: string;
    meetLink: string | null; provider: string; source: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const now = new Date();
        const start = new Date(now); start.setDate(now.getDate() - 30);
        const end = new Date(now); end.setDate(now.getDate() + 60);
        const params = new URLSearchParams({ startDate: start.toISOString(), endDate: end.toISOString() });
        const { clientApiFetch: apiFetch } = await import("@/lib/api-client");
        const res = await apiFetch(`/api/meetings/calendar-feed?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as { meetings: Array<{ id: string; title: string; startTime: string; endTime: string; meetLink: string | null; provider: string; source: string }> };
        const { encodeCalendarMeetingId } = await import("@/features/meetings/ids");
        const found = data.meetings.find(m => encodeCalendarMeetingId(m.id) === encodedId);
        if (found) setEvent(found);
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [encodedId]);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <LoaderCircle className="h-7 w-7 animate-spin text-[#6C3FF5]" />
    </div>
  );

  if (!event) return (
    <div className="space-y-4">
      <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#5F6368] hover:text-[#202124]">
        <ArrowLeft className="h-4 w-4" /> Back to meetings
      </button>
      <Card className="p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
        <p className="mt-3 text-sm font-semibold text-[#202124]">Calendar event not found</p>
        <p className="mt-1 text-xs text-[#5F6368]">This event may have been deleted or is outside the visible date range.</p>
      </Card>
    </div>
  );

  const startDate = new Date(event.startTime);
  const endDate = new Date(event.endTime);
  const providerLabel = event.source === "google_calendar" ? "Google Calendar"
    : event.source === "microsoft_teams" ? "Microsoft Teams"
    : event.source === "microsoft_outlook" ? "Outlook Calendar"
    : "Calendar";

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#5F6368] hover:text-[#202124] transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to meetings
      </button>
      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#6C3FF5]">{providerLabel}</p>
            <h1 className="mt-1 text-xl font-bold text-[#202124]">{event.title}</h1>
          </div>
          <span className="inline-flex items-center rounded-full bg-[#F1F3F4] px-3 py-1 text-xs font-semibold text-[#5F6368]">Scheduled</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-[#F8F9FA] px-4 py-3 border border-[#DADCE0]">
            <p className="text-xs font-semibold text-[#5F6368]">Date</p>
            <p className="mt-0.5 text-sm font-semibold text-[#202124]">
              {startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <div className="rounded-xl bg-[#F8F9FA] px-4 py-3 border border-[#DADCE0]">
            <p className="text-xs font-semibold text-[#5F6368]">Time</p>
            <p className="mt-0.5 text-sm font-semibold text-[#202124]">
              {startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – {endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        </div>
        {event.meetLink && (
          <div className="rounded-xl border border-[#DADCE0] bg-white px-4 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#5F6368]">Meeting Link</p>
              <p className="mt-0.5 truncate text-sm text-[#6C3FF5]">{event.meetLink}</p>
            </div>
            <a href={event.meetLink} target="_blank" rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] transition-colors">
              Join Meeting
            </a>
          </div>
        )}
        <div className="rounded-xl border border-[#6C3FF5]/20 bg-[#faf9ff] px-4 py-3">
          <p className="text-xs font-semibold text-[#5F6368]">
            This is a calendar event. To record and get an AI summary, click "Start AI Notetaker" from the Meetings page.
          </p>
        </div>
      </Card>
    </div>
  );
}

// ── MeetingDetail ─────────────────────────────────────────────────────────────

export function MeetingDetail({ meetingId }: MeetingDetailProps) {
  const router = useRouter();
  const { activeWorkspaceId, activeWorkspace } = useWorkspaceContext();
  const [meeting, setMeeting] = useState<MeetingDetailRecord | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [isMoveLoading, startMoveTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<DetailTab>("notes");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [upgradeBlocked, setUpgradeBlocked] = useState<{ reason: "upgrade_required" | "limit_reached" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [shareOpen, setShareOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [autoShareFailuresDismissed, setAutoShareFailuresDismissed] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

  const activeStates = new Set(["joining", "waiting_for_join", "waiting_for_admission", "joined", "capturing", "processing", "summarizing"]);
  const shouldPoll =
    meeting?.meetingSessionId != null &&
    meeting?.status != null &&
    (activeStates.has(meeting.status) || isPending);
  const session = useSessionPolling(shouldPoll ? (meeting?.meetingSessionId ?? null) : null);

  useEffect(() => {
    let isMounted = true;
    async function loadMeeting() {
      setIsLoading(true); setError(null); setNotFound(false); setUpgradeBlocked(null);
      try {
        const nextMeeting = await fetchMeetingById(meetingId);
        if (isMounted) setMeeting(nextMeeting);
      } catch (loadError) {
        const e = loadError as Error & { status?: number };
        if (!isMounted) return;
        if (e.status === 404 || e.status === 403) setNotFound(true);
        else setError(loadError instanceof Error ? loadError.message : "Failed to load meeting.");
      } finally { if (isMounted) setIsLoading(false); }
    }
    void loadMeeting();
    return () => { isMounted = false; };
  }, [meetingId]);

  // While a workspace share is awaiting admin approval, refetch so the banner updates after approve/reject.
  useEffect(() => {
    if (!meeting || meeting.workspaceMoveStatus !== "pending") return;

    function refreshWorkspaceShareState() {
      void fetchMeetingById(meetingId)
        .then((next) => {
          setMeeting((prev) => {
            if (!prev) return next;
            return {
              ...prev,
              workspaceId: next.workspaceId,
              workspaceMoveStatus: next.workspaceMoveStatus,
            };
          });
        })
        .catch(() => null);
    }

    const interval = window.setInterval(refreshWorkspaceShareState, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshWorkspaceShareState();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [meetingId, meeting?.workspaceMoveStatus]);

  useEffect(() => {
    if (!session) return;
    setMeeting((cur) => {
      if (!cur) return cur;
      const structured = session.summary;
      return {
        ...cur,
        status: session.state,
        errorCode: session.errorCode ?? cur.errorCode,
        failureReason: session.failureReason ?? cur.failureReason,
        captureStartedAt: session.recordingStartedAt ?? cur.captureStartedAt,
        captureEndedAt: session.recordingEndedAt ?? cur.captureEndedAt,
        transcript: session.transcript ?? cur.transcript,
        summary: structured?.summary ?? cur.summary,
        keyPoints: structured?.key_points?.length ? structured.key_points : cur.keyPoints,
        actionItems: structured?.action_items?.length ? normalizeMeetingActionItems(structured.action_items) : cur.actionItems,
        recordingUrl: session.recordingUrl ?? cur.recordingUrl,
        recordingDuration: session.recordingDuration ?? cur.recordingDuration,
        insights: session.insights ?? cur.insights,
        chapters: session.chapters ?? cur.chapters,
      };
    });
    if (session.state === "completed" || session.state === "failed") {
      void fetchMeetingById(meetingId).then((nextMeeting) => {
        setMeeting(nextMeeting); setActionError(null); setCopyFeedback(null);
        if (!nextMeeting.insights && session.state === "completed") {
          let retries = 0;
          const retryInsights = () => {
            retries++;
            if (retries > 15) return;
            setTimeout(() => {
              void fetchMeetingById(meetingId).then((r) => { if (r.insights) setMeeting(r); else retryInsights(); }).catch(() => null);
            }, retries * 2000);
          };
          retryInsights();
        }
      }).catch(() => null);
    }
  }, [meetingId, session]);

  const transcriptBlocks = useMemo(
    () => parseTranscriptBlocks(meeting?.transcript ?? null, meeting?.meetingDuration ?? null),
    [meeting?.meetingDuration, meeting?.transcript]
  );

  const speakerStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const block of transcriptBlocks) counts.set(block.speaker, (counts.get(block.speaker) || 0) + block.wordCount);
    const totalWords = Array.from(counts.values()).reduce((s, v) => s + v, 0);
    return Array.from(counts.entries())
      .map(([speaker, words]) => ({ speaker, words, percentage: totalWords > 0 ? Math.max(5, Math.round((words / totalWords) * 100)) : 0 }))
      .sort((a, b) => b.words - a.words);
  }, [transcriptBlocks]);

  const ownerNames = (meeting?.actionItems ?? []).map((i) => i.owner).filter(Boolean);
  const participantCount = Math.max(speakerStats.length, new Set(ownerNames).size, meeting?.transcript ? 1 : 0);
  const showProcessedResults =
    meeting?.status === "completed" || meeting?.status === "processing" ||
    hasProcessedMeetingContent(meeting ?? { transcript: null, summary: null, keyPoints: [], actionItems: [] }) ||
    (!!meeting && meeting.status === "failed" && hasProcessedMeetingContent(meeting));
  const canStartBot = meeting?.canJoinAndCapture &&
    !["waiting_for_join","waiting_for_admission","capturing","processing","summarizing","completed"].includes(meeting?.status ?? "");
  const canStopBot = ["waiting_for_join","waiting_for_admission","capturing"].includes(meeting?.status ?? "");

  function handleStartBot() {
    if (!meeting?.meetingLink) { setActionError("This meeting does not have a valid meeting link."); return; }
    setActionError(null); setUpgradeBlocked(null);
    startTransition(async () => {
      try {
        const started = await startMeetingCapture(meeting.id, meeting.meetingLink);
        setMeeting(started.meeting);
      } catch (startError) {
        const e = startError as Error & { status?: number; code?: string };
        if (e.status === 403 && (e.code === "upgrade_required" || e.code === "limit_reached")) {
          setUpgradeBlocked({ reason: e.code }); setActionError(null); return;
        }
        setActionError(startError instanceof Error ? startError.message : "Failed to start recording.");
      }
    });
  }

  function handleStopBot() {
    const targetId = meeting?.meetingSessionId ?? meetingId;
    startTransition(async () => {
      try { const stopped = await stopMeetingCapture(targetId); setMeeting(stopped); }
      catch (e) { setActionError(e instanceof Error ? e.message : "Failed to stop recording."); }
    });
  }

  async function handleCopyActionItemsAsText() {
    if (!meeting || (meeting.actionItems ?? []).length === 0) { setCopyFeedback("No action items are available to copy."); return; }
    const text = (meeting.actionItems ?? []).map((item, i) => `${i + 1}. ${item.task} — ${item.owner || "Unassigned"} (Due: ${item.dueDate || item.deadline || "Not specified"})`).join("\n");
    try { await copyTextToClipboard(text); setCopyFeedback("Action items copied as text."); }
    catch (e) { setCopyFeedback(e instanceof Error ? e.message : "Failed to copy action items."); }
  }

  async function handleCopyActionItemsAsMarkdown() {
    if (!meeting || (meeting.actionItems ?? []).length === 0) { setCopyFeedback("No action items are available to copy."); return; }
    const markdown = [`## Action Items — ${meeting.title}`, ...(meeting.actionItems ?? []).map((item) => `- [ ] ${item.task} — ${item.owner || "Unassigned"} (Due: ${item.dueDate || item.deadline || "Not specified"})`)].join("\n");
    try { await copyTextToClipboard(markdown); setCopyFeedback("Action items copied as markdown."); }
    catch (e) { setCopyFeedback(e instanceof Error ? e.message : "Failed to copy action items."); }
  }

  function handleMoveToWorkspace() {
    if (!activeWorkspaceId) return;
    setMoveError(null);
    startMoveTransition(async () => {
      try {
        const res = await clientApiFetch(`/api/meetings/${meetingId}/move-to-workspace`, { method: "POST", body: JSON.stringify({ workspaceId: activeWorkspaceId }) });
        if (!res.ok) { const data = (await res.json()) as { message?: string }; setMoveError(data.message ?? "Failed to submit move request."); }
      } catch { setMoveError("Failed to submit move request. Please try again."); }
    });
  }

  async function handleDeleteConfirm() {
    setIsDeleting(true); setDeleteError(null);
    try {
      const res = await clientApiFetch(`/api/meetings/${meetingId}`, { method: "DELETE" });
      if (!res.ok) { const data = (await res.json()) as { message?: string }; setDeleteError(data.message ?? "Failed to delete meeting."); setIsDeleting(false); return; }
      router.push("/dashboard/meetings");
    } catch { setDeleteError("Failed to delete meeting. Please try again."); setIsDeleting(false); }
  }

  function handleDownloadPdf() {
    if (!meeting) return;
    generateMeetingPdf(meeting);
  }

  if (isLoading) return <MeetingDetailSkeleton />;

  if (notFound) return (
    <ResultState title="Meeting not found" description="This meeting is unavailable or you no longer have access to it.">
      <Button asChild variant="secondary"><Link href="/dashboard/meetings">Back to meetings</Link></Button>
    </ResultState>
  );

  if (error || !meeting) return (
    <ResultState icon="error" title="Unable to load meeting" description={error || "An unexpected error occurred while loading this meeting."}>
      <Button asChild variant="secondary"><Link href="/dashboard/meetings">Back to meetings</Link></Button>
    </ResultState>
  );

  const effectiveStatus: MeetingDetailRecord["status"] =
    meeting.status === "scheduled" && hasProcessedMeetingContent(meeting) ? "completed" : meeting.status;
  const failureMessage = getFailureMessage(meeting.errorCode ?? null, meeting.failureReason || actionError);
  const sessionPlatform = session?.platform || getPlatformFromUrl(meeting.meetingLink);
  const platform = getPlatformConfig(sessionPlatform);
  const platformName = session?.platformName || platform.name;
  const recordingUrl =
    session?.recordingUrl ??
    meeting.recordingUrl ??
    (effectiveStatus === "completed" || effectiveStatus === "failed"
      ? `/api/recordings/${meetingId}`
      : null);
  const recordingDuration = session?.recordingDuration ?? meeting.recordingDuration;
  const durationLabel = formatMeetingDuration(meeting.meetingDuration);

  const resolvedInsights = (session?.insights ?? meeting.insights) as {
    speakers?: Array<{ name: string; talkTimePercent: number; wordCount: number; sentiment: string }>;
    sentiment?: { overall?: string; score?: number; timeline?: Array<{ segment: number; label: string; score: number }> };
    topics?: Array<{ title: string; duration: number; summary: string }>;
    wordCloud?: Array<{ word: string; count: number }>;
    engagementScore?: number; totalWords?: number; avgWordsPerMinute?: number;
    keyMoments?: Array<{ time: string; description: string }>;
  } | null;
  const resolvedChapters = (session?.chapters ?? meeting.chapters) as Array<{ title: string; startMinute: number; endMinute: number; summary: string }> | null;

  return (
    <div className="space-y-5">
      {/* Back + action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/meetings"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#5F6368] hover:text-[#202124] transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Meetings
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {activeWorkspaceId === null ? (
            <ShareToWorkspaceButton meetingId={meetingId} workspaceMoveStatus={meeting.workspaceMoveStatus}
              workspaceId={meeting.workspaceId} isOwner={meeting.isOwner} dbMeetingId={meeting.meetingSessionId}
              calendarMeeting={isCalendarMeetingId(meetingId) ? { title: meeting.title, meetingLink: meeting.meetingLink, scheduledStartTime: meeting.scheduledStartTime ?? undefined, scheduledEndTime: meeting.scheduledEndTime ?? undefined, provider: meeting.provider, externalCalendarEventId: meeting.externalCalendarEventId ?? undefined } : undefined} />
          ) : activeWorkspaceId !== null && meeting.workspaceId === activeWorkspaceId ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EDE9FE] px-3 py-1 text-sm font-medium text-[#6C3FF5]">{activeWorkspace?.name ?? "Workspace"}</span>
          ) : activeWorkspaceId !== null && meeting.workspaceId !== activeWorkspaceId ? (
            <>
              <button type="button" onClick={handleMoveToWorkspace} disabled={isMoveLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#6C3FF5] hover:bg-[#EDE9FE] transition-colors">
                {isMoveLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <span className="material-symbols-outlined text-[16px]">share</span>}
                Move to workspace
              </button>
              {moveError && <span className="text-sm text-red-600">{moveError}</span>}
            </>
          ) : null}
          {showProcessedResults && (
            <button type="button" onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 rounded-lg border border-[#DADCE0] bg-white px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
              <span className="material-symbols-outlined text-[16px]">download</span> Download
            </button>
          )}
          {meeting?.isOwner && (
            <button type="button" onClick={() => setShowDeleteConfirm(true)} disabled={isDeleting}
              className="inline-flex items-center gap-2 rounded-lg border border-red-100 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
              {isDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Auto-share failure banner */}
      {session?.autoShareFailures && session.autoShareFailures.length > 0 && !autoShareFailuresDismissed && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-[#991b1b]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold text-[#7f1d1d]">Auto-share failed</p>
              <p className="mt-1 text-sm">Integrations failed: <strong>{session.autoShareFailures.map((f) => f.integration).join(", ")}</strong>. Check your integration settings.</p>
            </div>
          </div>
          <button type="button" onClick={() => setAutoShareFailuresDismissed(true)}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-[#991b1b] hover:bg-[#fecaca] transition-colors">
            Dismiss
          </button>
        </div>
      )}

      {/* Meeting header card */}
      <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {renderStatusBadge(effectiveStatus)}
          <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: platform.bg, color: platform.color }}>
            <span className="material-symbols-outlined text-[11px]">{platform.icon}</span>
            {platformName}
          </span>
          {durationLabel && (
            <span className="flex items-center gap-1 text-xs text-[#5F6368]">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              {durationLabel}
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-[#202124]" style={{ fontFamily: "'Work Sans', sans-serif" }}>{meeting.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[#5F6368]">
          {meeting.scheduledStartTime && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]">calendar_today</span>
                {formatMeetingDate(meeting.scheduledStartTime)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]">schedule</span>
                {formatMeetingTime(meeting.scheduledStartTime)}
                {meeting.scheduledEndTime ? ` – ${formatMeetingTime(meeting.scheduledEndTime)}` : ""}
              </span>
            </>
          )}
          {participantCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px]">group</span>
              {participantCount} participant{participantCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      {showProcessedResults && (
        <div className="flex items-center gap-0 border-b border-[#DADCE0]">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={cn("flex items-center gap-1.5 px-4 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id ? "border-[#6C3FF5] text-[#6C3FF5] font-semibold" : "border-transparent text-[#5F6368] hover:text-[#202124]")}>
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              {tab.label}
              {tab.id === "notes" && (meeting.actionItems ?? []).length > 0 && (
                <span className="ml-1 rounded-full bg-[#EDE9FE] px-1.5 py-0.5 text-[10px] font-bold text-[#6C3FF5]">
                  {(meeting.actionItems ?? []).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* AI Notetaker control card */}
      <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#6C3FF5] text-[18px]">smart_toy</span>
              <p className="text-sm font-semibold text-[#202124]">AI Notetaker</p>
            </div>
            <p className="text-sm text-[#5F6368]">{getStatusMessage(effectiveStatus)}</p>
            <p className="text-xs text-[#9AA0A6]">Supports Google Meet, Zoom, and Microsoft Teams</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canStartBot && !upgradeBlocked ? (
              <button type="button" onClick={handleStartBot} disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] disabled:opacity-60 transition-colors shadow-sm">
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                Start AI Notetaker
              </button>
            ) : canStartBot && upgradeBlocked ? (
              <Link href="/dashboard/billing"
                className="inline-flex items-center gap-2 rounded-lg bg-[#1f1147] px-4 py-2 text-sm font-semibold text-white hover:bg-[#140b33] transition-colors">
                Upgrade to Pro to record meetings
              </Link>
            ) : canStopBot ? (
              <button type="button" onClick={handleStopBot} disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[#EA4335] px-4 py-2 text-sm font-semibold text-white hover:bg-[#C5221F] disabled:opacity-60 transition-colors">
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                Stop Recording
              </button>
            ) : null}
          </div>
        </div>
        {meeting.status === "failed" && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-[#C5221F]" />
              <div>
                <p className="font-semibold text-[#7f1d1d]">Recording Failed</p>
                <p className="mt-1 text-sm text-[#991b1b]">{failureMessage}</p>
              </div>
            </div>
            <button type="button" onClick={handleStartBot} disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-[#EA4335] px-4 py-2 text-sm font-semibold text-white hover:bg-[#C5221F] disabled:opacity-60 transition-colors">
              Try Again
            </button>
          </div>
        )}
        {actionError && <div className="mt-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#991b1b]">{actionError}</div>}
        {upgradeBlocked && (
          <div className="mt-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#B06000]">Locked Feature</p>
                <p className="mt-1 font-semibold text-[#202124]">Meeting recording requires Pro or Elite</p>
                <p className="mt-1 text-sm text-[#92400e]">
                  {upgradeBlocked.reason === "limit_reached" ? "You have reached your monthly meeting limit." : "Free plan users can keep using the three core generators, but meeting capture is locked."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/dashboard/billing" className="inline-flex items-center gap-1.5 rounded-lg bg-[#6C3FF5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B2FE0] transition-colors">Upgrade to Pro</Link>
                <Link href="/dashboard/billing" className="inline-flex items-center gap-1.5 rounded-lg border border-[#DADCE0] bg-white px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">View all plans</Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notes tab */}
      {activeTab === "notes" && (
        <>
          {showProcessedResults ? (
            <MeetingProcessedContent meeting={meeting} speakerStats={speakerStats}
              shareOpen={shareOpen} setShareOpen={setShareOpen} copyFeedback={copyFeedback}
              handleCopyActionItemsAsMarkdown={handleCopyActionItemsAsMarkdown}
              handleCopyActionItemsAsText={handleCopyActionItemsAsText} />
          ) : meeting.status !== "failed" ? (
            <ResultState icon="loading" title="Report not ready yet" description={getStatusMessage(meeting.status)} />
          ) : null}
        </>
      )}

      {/* Transcript tab */}
      {activeTab === "transcript" && (
        <div className="space-y-4">
          {recordingUrl && <AudioPlayer url={recordingUrl} duration={recordingDuration} />}

          {/* Speaker Distribution */}
          {speakerStats.length > 0 && (
            <div className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <p className="text-sm font-semibold text-[#202124] mb-4">Speaker Distribution</p>
              <div className="space-y-3">
                {speakerStats.map((s, i) => (
                  <div key={s.speaker}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white"
                          style={{ background: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }}>
                          {s.speaker.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-[#202124]">{s.speaker}</span>
                      </div>
                      <span className="text-sm font-semibold text-[#5F6368]">{s.percentage}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#F1F3F4]">
                      <div className="h-full rounded-full transition-all" style={{ width: `${s.percentage}%`, background: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transcript blocks */}
          {(session?.transcript || meeting.transcript) ? (
            <div className="rounded-xl border border-[#DADCE0] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#DADCE0] bg-[#F8F9FA]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#6C3FF5] text-[18px]">article</span>
                  <p className="text-sm font-semibold text-[#202124]">Meeting Transcript</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { void navigator.clipboard.writeText(session?.transcript || meeting.transcript || ""); }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#DADCE0] bg-white px-3 py-1.5 text-xs font-semibold text-[#5F6368] hover:bg-[#F8F9FA] transition-colors">
                    <span className="material-symbols-outlined text-[14px]">content_copy</span> Copy
                  </button>
                  <button type="button" onClick={() => setTranscriptExpanded(!transcriptExpanded)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#6C3FF5] hover:underline">
                    {transcriptExpanded ? <><ChevronUp className="h-3.5 w-3.5" /> Collapse</> : <><ChevronDown className="h-3.5 w-3.5" /> Expand</>}
                  </button>
                </div>
              </div>
              <div className={cn("divide-y divide-[#F1F3F4] overflow-y-auto transition-all", transcriptExpanded ? "max-h-none" : "max-h-[480px]")}>
                {transcriptBlocks.length > 0 ? transcriptBlocks.map((block, i) => (
                  <div key={`tb-${i}`} className="flex gap-4 px-5 py-4 hover:bg-[#F8F9FA] transition-colors">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: SPEAKER_COLORS[speakerStats.findIndex(s => s.speaker === block.speaker) % SPEAKER_COLORS.length] || SPEAKER_COLORS[0] }}>
                      {getInitials(block.speaker)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-[#202124]">{block.speaker}</span>
                        <span className="rounded bg-[#EDE9FE] px-1.5 py-0.5 text-[10px] font-bold text-[#6C3FF5]">{block.timestamp}</span>
                      </div>
                      <p className="text-sm leading-relaxed text-[#374151]">&ldquo;{block.text}&rdquo;</p>
                    </div>
                  </div>
                )) : (
                  <div className="px-5 py-4">
                    <pre className="text-xs leading-relaxed text-[#374151] whitespace-pre-wrap font-mono overflow-x-auto">
                      {session?.transcript || meeting.transcript}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#DADCE0] bg-white p-12 text-center">
              <span className="material-symbols-outlined text-[#DADCE0] text-4xl">article</span>
              <p className="mt-2 text-sm text-[#5F6368]">Transcript will appear here after the meeting is processed.</p>
            </div>
          )}
        </div>
      )}

      {/* Insights tab */}
      {activeTab === "insights" && (
        <div className="space-y-4">
          {!resolvedInsights ? (
            <div className="rounded-xl border border-dashed border-[#DADCE0] bg-white p-12 text-center">
              <span className="material-symbols-outlined text-[#DADCE0] text-4xl">insights</span>
              <p className="mt-2 text-sm font-semibold text-[#5F6368]">Insights are being generated…</p>
              <p className="mt-1 text-xs text-[#9AA0A6]">This may take a moment after the meeting ends.</p>
            </div>
          ) : (
            <>
              {/* Score cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <ScoreCard label="Engagement Score" value={resolvedInsights.engagementScore ?? 0} max={100} color="#6C3FF5" />
                <ScoreCard label="Overall Sentiment" value={resolvedInsights.sentiment?.overall ?? "neutral"} isText
                  color={resolvedInsights.sentiment?.overall === "positive" ? "#137333" : resolvedInsights.sentiment?.overall === "negative" ? "#C5221F" : "#B06000"} />
                <ScoreCard label="Total Words" value={resolvedInsights.totalWords ?? 0} subtitle={`~${resolvedInsights.avgWordsPerMinute ?? 0} wpm`} color="#2563eb" />
              </div>

              {/* Speaker Participation */}
              {(resolvedInsights.speakers || []).length > 0 && (
                <InsightsCard title="Speaker Participation" icon="group">
                  <div className="space-y-4">
                    {(resolvedInsights.speakers || []).map((speaker, i) => (
                      <div key={`sp-${i}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white"
                              style={{ background: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }}>
                              {speaker.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-[#202124]">{speaker.name}</span>
                          </div>
                          <span className="text-sm font-semibold text-[#5F6368]">{speaker.talkTimePercent}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-[#F1F3F4]">
                          <div className="h-full rounded-full transition-all" style={{ width: `${speaker.talkTimePercent}%`, background: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }} />
                        </div>
                        <p className="mt-1 text-xs text-[#9AA0A6]">{speaker.wordCount} words · {speaker.sentiment}</p>
                      </div>
                    ))}
                  </div>
                </InsightsCard>
              )}

              {/* Topics */}
              {(resolvedInsights.topics || []).length > 0 && (
                <InsightsCard title="Topics Covered" icon="label">
                  <div className="flex flex-wrap gap-2">
                    {(resolvedInsights.topics || []).map((topic, i) => (
                      <div key={`t-${i}`} className="rounded-lg border border-[#EDE9FE] bg-[#F5F3FF] px-3 py-2">
                        <p className="text-xs font-semibold text-[#6C3FF5]">{topic.title}</p>
                        <p className="text-[11px] text-[#9AA0A6]">~{topic.duration} min</p>
                        {topic.summary && <p className="mt-1 text-xs text-[#5F6368]">{topic.summary}</p>}
                      </div>
                    ))}
                  </div>
                </InsightsCard>
              )}

              {/* Sentiment Timeline */}
              {(resolvedInsights.sentiment?.timeline || []).length > 0 && (
                <InsightsCard title="Sentiment Timeline" icon="mood">
                  <div className="flex items-end gap-1 h-14">
                    {(resolvedInsights.sentiment?.timeline || []).map((point, i) => (
                      <div key={i} title={`${point.label}: ${point.score}/100`}
                        className="flex-1 rounded-t min-h-[4px] opacity-80"
                        style={{ height: `${point.score}%`, background: point.label === "positive" ? "#34A853" : point.label === "negative" ? "#EA4335" : "#B06000" }} />
                    ))}
                  </div>
                  <div className="flex justify-between mt-1 text-[11px] text-[#9AA0A6]"><span>Start</span><span>End</span></div>
                  <div className="flex gap-3 mt-2 text-xs">
                    <span className="text-[#34A853]">● Positive</span>
                    <span className="text-[#B06000]">● Neutral</span>
                    <span className="text-[#EA4335]">● Negative</span>
                  </div>
                </InsightsCard>
              )}

              {/* Key Words */}
              {(resolvedInsights.wordCloud || []).length > 0 && (
                <InsightsCard title="Key Words" icon="chat_bubble">
                  <div className="flex flex-wrap gap-2">
                    {(resolvedInsights.wordCloud || []).map((item, i) => {
                      const size = Math.max(11, Math.min(22, 11 + item.count * 1.5));
                      return (
                        <span key={`wc-${i}`} style={{ fontSize: `${size}px`, color: WORD_COLORS[i % WORD_COLORS.length], fontWeight: item.count > 8 ? 600 : 400 }}>
                          {item.word}
                        </span>
                      );
                    })}
                  </div>
                </InsightsCard>
              )}

              {/* Key Moments */}
              {(resolvedInsights.keyMoments || []).length > 0 && (
                <InsightsCard title="Key Moments" icon="bolt">
                  <div className="divide-y divide-[#F1F3F4]">
                    {(resolvedInsights.keyMoments || []).map((moment, i) => (
                      <div key={`km-${i}`} className="flex gap-3 py-3">
                        <span className="rounded-lg bg-[#EDE9FE] px-2 py-0.5 text-xs font-bold text-[#6C3FF5] whitespace-nowrap">{moment.time}</span>
                        <span className="text-sm text-[#374151]">{moment.description}</span>
                      </div>
                    ))}
                  </div>
                </InsightsCard>
              )}

              {/* Chapters */}
              {(resolvedChapters || []).length > 0 && (
                <InsightsCard title="Meeting Chapters" icon="menu_book">
                  <div className="divide-y divide-[#F1F3F4]">
                    {(resolvedChapters || []).map((chapter, i) => (
                      <div key={`ch-${i}`} className="py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#6C3FF5] text-[11px] font-bold text-white shrink-0">{i + 1}</span>
                          <span className="text-sm font-semibold text-[#202124]">{chapter.title}</span>
                          <span className="ml-auto text-xs text-[#9AA0A6]">{chapter.startMinute}m – {chapter.endMinute}m</span>
                        </div>
                        <p className="ml-8 text-xs text-[#5F6368]">{chapter.summary}</p>
                      </div>
                    ))}
                  </div>
                </InsightsCard>
              )}
            </>
          )}
        </div>
      )}

      {/* Share modal */}
      {shareOpen && meeting.summary && (
        <MeetingShareModal meeting={{ title: meeting.title, summary: meeting.summary, actionItems: meeting.actionItems, transcript: meeting.transcript }} onClose={() => setShareOpen(false)} />
      )}

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FCE8E6]">
                <Trash2 className="h-5 w-5 text-[#EA4335]" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[#202124]">Delete meeting?</h2>
                <p className="mt-1 text-sm text-[#5F6368]">This will permanently delete <strong>{meeting.title}</strong> and all associated data. This action is irreversible.</p>
              </div>
            </div>
            {deleteError && <div className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#991b1b]">{deleteError}</div>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }} disabled={isDeleting}
                className="rounded-lg border border-[#DADCE0] px-4 py-2 text-sm font-semibold text-[#5F6368] hover:bg-[#F8F9FA] disabled:opacity-50 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={() => void handleDeleteConfirm()} disabled={isDeleting}
                className="inline-flex items-center gap-2 rounded-lg bg-[#EA4335] px-4 py-2 text-sm font-semibold text-white hover:bg-[#C5221F] disabled:opacity-50 transition-colors">
                {isDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Delete meeting
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
