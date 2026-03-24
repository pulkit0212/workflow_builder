"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, ExternalLink, Video } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatUpcomingMeetingTimeRange,
  getUpcomingMeetingStatus,
  getUpcomingMeetingStatusBadgeVariant,
  getUpcomingMeetingStatusLabel
} from "@/features/upcoming-meetings/helpers";
import { buildMeetingAssistantHref as buildMeetingDetailHref } from "@/features/upcoming-meetings/navigation";
import type { UpcomingMeeting } from "@/features/upcoming-meetings/types";

type UpcomingMeetingsPanelProps = {
  meetings: UpcomingMeeting[];
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
};

export function UpcomingMeetingsPanel({
  meetings,
  title,
  description,
  emptyTitle,
  emptyDescription
}: UpcomingMeetingsPanelProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-blue-100 bg-[linear-gradient(90deg,rgba(239,246,255,0.95),rgba(255,255,255,0.96),rgba(238,242,255,0.95))] px-6 py-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Google Calendar</p>
          <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
          <p className="text-sm text-slate-600">{description}</p>
        </div>
      </div>

      <div className="p-6">
        {meetings.length === 0 ? (
          <EmptyState icon={CalendarDays} title={emptyTitle} description={emptyDescription} />
        ) : (
          <div className="space-y-4">
            {meetings.map((meeting) => {
              const status = getUpcomingMeetingStatus(meeting, now);

              return (
                <div
                  key={meeting.id}
                  className="rounded-[1.8rem] border border-blue-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(239,246,255,0.72))] p-5"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="available">Google Meet</Badge>
                        <Badge variant={getUpcomingMeetingStatusBadgeVariant(status)}>
                          {getUpcomingMeetingStatusLabel(status)}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-slate-950">{meeting.title}</h3>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <CalendarDays className="h-4 w-4 text-indigo-600" />
                          {formatUpcomingMeetingTimeRange(meeting)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {meeting.meetLink ? (
                        <>
                          <Button asChild>
                            <Link href={buildMeetingDetailHref(meeting) as Route}>
                              View meeting
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button asChild variant="secondary">
                            <a href={meeting.meetLink} target="_blank" rel="noreferrer">
                              Join link
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </>
                      ) : (
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500">
                          <Video className="h-4 w-4 text-slate-400" />
                          No Meet link available
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
