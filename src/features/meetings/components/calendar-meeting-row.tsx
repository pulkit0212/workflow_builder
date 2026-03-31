import type { Route } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { encodeCalendarMeetingId } from "@/features/meetings/ids";
import type { GoogleCalendarMeeting } from "@/lib/google/types";

function formatTimeRange(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Time unavailable";
  }

  return `${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

function getMeetingStatus(meeting: GoogleCalendarMeeting) {
  const now = Date.now();
  const start = new Date(meeting.startTime).getTime();
  const end = new Date(meeting.endTime).getTime();

  if (now >= start && now <= end) {
    return { label: "Live", variant: "accent" as const };
  }

  if (now > end) {
    return { label: "Ended", variant: "neutral" as const };
  }

  return { label: "Upcoming", variant: "info" as const };
}

function getInitial(value: string) {
  return value.trim().charAt(0).toUpperCase() || "M";
}

function getPlatformFromUrl(url: string | null | undefined) {
  if (!url) return "google";

  const normalized = url.toLowerCase();

  if (normalized.includes("zoom.us") || normalized.includes("zoom.com")) {
    return "zoom";
  }

  if (normalized.includes("teams.microsoft.com") || normalized.includes("teams.live.com")) {
    return "teams";
  }

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
};

export function CalendarMeetingRow({ meeting }: CalendarMeetingRowProps) {
  const detailHref = `/dashboard/meetings/${encodeCalendarMeetingId(meeting.id)}` as Route;
  const status = getMeetingStatus(meeting);
  const platform = getPlatformFromUrl(meeting.meetLink);
  const platformBadge = getPlatformBadge(platform);

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
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {meeting.meetLink ? (
          <Button asChild>
            <a href={meeting.meetLink} target="_blank" rel="noreferrer">
              Join Meeting
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        ) : null}
        <Button asChild variant="secondary">
          <Link href={detailHref}>View Details</Link>
        </Button>
      </div>
    </div>
  );
}
