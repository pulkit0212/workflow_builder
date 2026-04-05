"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { encodeCalendarMeetingId } from "@/features/meetings/ids";
import { getMeetingDisplayStatus } from "@/features/meetings/meeting-status";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { GoogleCalendarMeeting } from "@/lib/google/types";
import { useRef, useState } from "react";

function formatTimeRange(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Time unavailable";
  const s = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const e = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return s === e ? s : `${s} - ${e}`;
}

function getInitial(value: string) {
  return value.trim().charAt(0).toUpperCase() || "M";
}

function getPlatformFromUrl(url: string | null | undefined) {
  if (!url) return "google";
  const normalized = url.toLowerCase();
  if (normalized.includes("zoom.us") || normalized.includes("zoom.com")) return "zoom";
  if (normalized.includes("teams.microsoft.com") || normalized.includes("teams.live.com")) return "teams";
  return "google";
}

function getPlatformBadge(platform: string) {
  switch (platform) {
    case "zoom":
      return { label: "Zoom", className: "border-[#bfdbfe] bg-[#eff6ff] text-[#2D8CFF]" };
    case "teams":
      return { label: "Microsoft Teams", className: "border-[#ddd6fe] bg-[#f5f3ff] text-[#6264A7]" };
    default:
      return { label: "Google Meet", className: "border-[#bbf7d0] bg-[#f0fdf4] text-[#00AC47]" };
  }
}

type CalendarMeetingRowProps = {
  meeting: GoogleCalendarMeeting;
  session?: MeetingSessionRecord | null;
};

export function CalendarMeetingRow({ meeting, session }: CalendarMeetingRowProps) {
  const router = useRouter();
  const detailHref = `/dashboard/meetings/${encodeCalendarMeetingId(meeting.id)}` as Route;
  const status = getMeetingDisplayStatus(meeting, session);
  const platform = getPlatformFromUrl(meeting.meetLink);
  const platformBadge = getPlatformBadge(platform);
  const [toast, setToast] = useState<ToastState | null>(null);
    const toastTimer = useRef<number | null>(null);


    function showToast(message: string, type: ToastType) {
    setToast({ message, type });
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
    }, type === "error" ? 5000 : 3000);
  }
  type ToastType = "success" | "error" | "info";

type ToastState = {
  message: string;
  type: ToastType;
};

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#e5e7eb] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f5f3ff] text-sm font-semibold text-[#6c63ff]">
          {getInitial(meeting.title)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold text-[#1f2937]">{meeting.title}</p>
          <p className="mt-1 text-sm text-[#6b7280]">{formatTimeRange(meeting.startTime, meeting.endTime)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold ${platformBadge.className}`}
            >
              {platformBadge.label}
            </span>
            {/* Status badge with pulse */}
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold"
              style={{ background: status.bg, color: status.color }}
            >
              {status.pulse ? (
                <span
                  className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                  style={{ backgroundColor: status.color }}
                />
              ) : null}
              {status.label}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {status.showJoin && meeting.meetLink ? (
          <Button
           type="button"
           size="sm"
           className="bg-[#16a34a] hover:bg-[#15803d]"
           onClick={() => {
            navigator.clipboard.writeText(meeting.meetLink!)
            showToast("Meeting link copied","success")
         }}>
          Copy Meeting Link
         </Button>
       ) : null}

        {status.showStartNotetaker ? (
          <Button asChild size="sm">
            <Link href={detailHref}>Start AI Notetaker</Link>
          </Button>
        ) : null}

        {status.showStopRecording && session ? (
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => router.push(`/dashboard/meetings/${session.id}` as Route)}
          >
            Stop Recording
          </Button>
        ) : null}

        {status.showViewReport && session ? (
          <Button
            type="button"
            size="sm"
            onClick={() => router.push(`/dashboard/meetings/${session.id}` as Route)}
          >
            View Report
          </Button>
        ) : null}

        {/* Always show View Details */}
        <Button asChild variant="secondary" size="sm">
          <Link href={detailHref}>View Details</Link>
        </Button>
      </div>
    </div>
  );
  
}
