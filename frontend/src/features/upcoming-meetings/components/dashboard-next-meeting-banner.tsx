"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatUpcomingMeetingDateTime,
  getMinutesUntilMeeting,
  getUpcomingMeetingStatus
} from "@/features/upcoming-meetings/helpers";
import { buildMeetingAssistantHref as buildMeetingDetailHref } from "@/features/upcoming-meetings/navigation";
import type { UpcomingMeeting } from "@/features/upcoming-meetings/types";

type DashboardNextMeetingBannerProps = {
  meetings: UpcomingMeeting[];
};

export function DashboardNextMeetingBanner({ meetings }: DashboardNextMeetingBannerProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  const meeting = useMemo(
    () =>
      meetings
        .filter((item) => getUpcomingMeetingStatus(item, now) === "starting_soon")
        .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime())[0] ?? null,
    [meetings, now]
  );

  if (!meeting || !meeting.meetLink) {
    return null;
  }

  const minutesUntilMeeting = getMinutesUntilMeeting(meeting, now);

  return (
    <Card className="overflow-hidden border-indigo-100 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_28%),linear-gradient(90deg,#ffffff,#eef2ff)] text-slate-950">
      <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600">Smart Start</p>
          <h2 className="text-2xl font-semibold tracking-tight">
            {minutesUntilMeeting === 0
              ? "Your next Google Meet is starting now"
              : `Your next Google Meet starts in ${minutesUntilMeeting} minutes`}
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="font-medium">{meeting.title}</span>
            <span className="inline-flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              {formatUpcomingMeetingDateTime(meeting.startTime)}
            </span>
          </div>
        </div>

        <Button asChild variant="secondary" size="lg" className="bg-slate-950 text-white ring-0 hover:bg-slate-900">
          <Link href={buildMeetingDetailHref(meeting) as Route}>
            Open meeting
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
