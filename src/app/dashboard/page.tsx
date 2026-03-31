"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { CalendarDays, CheckCircle2, ClipboardList, Video } from "lucide-react";
import { SkeletonList } from "@/components/SkeletonCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fetchJoinedMeetings, fetchTodayMeetings } from "@/features/meetings/api";
import { encodeCalendarMeetingId } from "@/features/meetings/ids";
import { formatMeetingDateTime } from "@/features/meetings/helpers";
import type { MeetingSessionRecord } from "@/features/meeting-assistant/types";
import type { GoogleCalendarMeeting } from "@/lib/google/types";
import { cn } from "@/lib/utils";

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
};

function sanitizeSummary(summary: string | null) {
  const value = summary?.replace(/\s+/g, " ").trim() || "";
  const normalized = value.toLowerCase();
  const blockedPatterns = ["summary generation failed", "googlegenerativeai error", "error fetching", "404", "failed:"];

  if (!value) {
    return { text: "Summary not available for this meeting.", isFallback: true };
  }

  const hasBlockedPattern = blockedPatterns.some((pattern) => normalized.includes(pattern));

  if (hasBlockedPattern) {
    return { text: "Summary not available for this meeting.", isFallback: true };
  }

  return {
    text: value.length > 110 ? `${value.slice(0, 107).trimEnd()}...` : value,
    isFallback: false
  };
}

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

function getMeetingDetailHref(meeting: GoogleCalendarMeeting) {
  return `/dashboard/meetings/${encodeCalendarMeetingId(meeting.id)}`;
}

function StatCard({
  label,
  value,
  helper,
  icon,
  accent,
  iconBg
}: {
  label: string;
  value: number;
  helper: string;
  icon: ReactNode;
  accent: string;
  iconBg: string;
}) {
  return (
    <Card className="card-shadow-hover rounded-xl border border-gray-100 bg-white p-6 transition-shadow" style={{ borderLeft: `4px solid ${accent}` }}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: iconBg, color: accent }}>
            {icon}
          </span>
        </div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
          <p className="mt-2 text-[36px] font-bold leading-none text-gray-900">{value}</p>
          <p className="mt-3 text-sm text-gray-500">{helper}</p>
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useUser();
  const [reports, setReports] = useState<MeetingSessionRecord[]>([]);
  const [todayMeetings, setTodayMeetings] = useState<GoogleCalendarMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    setIsLoading(true);
    setError(null);

    try {
      const [joinedMeetings, todayResponse] = await Promise.all([
        fetchJoinedMeetings(),
        fetchTodayMeetings().catch(() => ({ status: "connected" as const, meetings: [] }))
      ]);

      setReports(joinedMeetings);
      setTodayMeetings(todayResponse.meetings.slice(0, 3));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard.");
      setReports([]);
      setTodayMeetings([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [joinedMeetings, todayResponse] = await Promise.all([
          fetchJoinedMeetings(),
          fetchTodayMeetings().catch(() => ({ status: "connected" as const, meetings: [] }))
        ]);

        if (!isMounted) {
          return;
        }

        setReports(joinedMeetings);
        setTodayMeetings(todayResponse.meetings.slice(0, 3));
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard.");
          setReports([]);
          setTodayMeetings([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const greeting = useMemo(() => getGreeting(), []);
  const completedReports = reports.filter((meeting) => meeting.status === "completed");
  const meetingsThisWeek = reports.filter((meeting) => {
    const timestamp = new Date(meeting.scheduledStartTime ?? meeting.createdAt).getTime();
    return timestamp >= Date.now() - 7 * 24 * 60 * 60 * 1000;
  }).length;
  const totalActionItems = reports.reduce((total, meeting) => total + meeting.actionItems.length, 0);
  const recentReports = completedReports.slice(0, 5);
  const stats = [
    {
      label: "Total Meetings Recorded",
      value: reports.length,
      helper: `${completedReports.length} completed summaries ready`,
      icon: <Video className="h-5 w-5" />,
      accent: "#6c63ff",
      iconBg: "#f5f3ff"
    },
    {
      label: "Meetings This Week",
      value: meetingsThisWeek,
      helper: "Pulled from your recent meeting activity",
      icon: <CalendarDays className="h-5 w-5" />,
      accent: "#2563eb",
      iconBg: "#eff6ff"
    },
    {
      label: "Total Action Items",
      value: totalActionItems,
      helper: "Tasks captured across all saved reports",
      icon: <ClipboardList className="h-5 w-5" />,
      accent: "#16a34a",
      iconBg: "#f0fdf4"
    },
    {
      label: "Completed Meetings",
      value: completedReports.length,
      helper: "Meetings with transcripts and summaries complete",
      icon: <CheckCircle2 className="h-5 w-5" />,
      accent: "#ca8a04",
      iconBg: "#fefce8"
    }
  ];
  const avatarColors = [
    "bg-[#f5f3ff] text-[#6c63ff]",
    "bg-[#eff6ff] text-[#2563eb]",
    "bg-[#f0fdf4] text-[#16a34a]",
    "bg-[#fefce8] text-[#ca8a04]",
    "bg-[#fff1f2] text-[#f97316]"
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonList count={4} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-[22px] font-bold text-gray-900">
            {greeting}, {user?.firstName || "there"} 👋
          </h1>
          <p className="text-sm text-gray-500">Here&apos;s your meeting intelligence overview.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>

        {error ? (
          <Card className="border-[#fecaca] bg-[#fef2f2] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#991b1b]">Unable to load dashboard</p>
                <p className="mt-2 text-sm text-[#991b1b]">{error}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => void loadDashboard()}>
                Retry
              </Button>
            </div>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <Card className="col-span-1 rounded-xl border border-gray-100 bg-white shadow-sm xl:col-span-3">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Recent Reports</h2>
                <p className="mt-1 text-[13px] text-gray-500">Last 5 completed meetings</p>
              </div>
              <Link href="/dashboard/reports" className="text-sm font-medium text-[#6c63ff] hover:text-[#5b52ee]">
                View all →
              </Link>
            </div>

            <div className="divide-y divide-[#f3f4f6]">
              {recentReports.length > 0 ? (
                recentReports.map((meeting, index) => {
                  const summary = sanitizeSummary(meeting.summary);

                  return (
                    <div key={meeting.id} className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-[#fafafa] sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-4">
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                            avatarColors[index % avatarColors.length]
                          )}
                        >
                          {meeting.title.charAt(0).toUpperCase() || "M"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-gray-900">{meeting.title}</p>
                          <p className="mt-1 text-[12px] text-gray-400">{formatMeetingDateTime(meeting.scheduledStartTime ?? meeting.createdAt)}</p>
                          <p
                            className={cn(
                              "mt-1 truncate text-[13px]",
                              summary.isFallback ? "italic text-gray-400" : "text-gray-500"
                            )}
                          >
                            {summary.text}
                          </p>
                        </div>
                      </div>
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/dashboard/meetings/${meeting.id}`}>View</Link>
                      </Button>
                    </div>
                  );
                })
              ) : (
                <div className="px-6 py-10 text-center text-sm text-gray-500">No completed reports yet.</div>
              )}
            </div>
          </Card>

          <Card className="col-span-1 rounded-xl border border-gray-100 bg-white shadow-sm xl:col-span-2">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Today&apos;s Meetings</h2>
                <p className="mt-1 text-[13px] text-gray-500">
                  {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <Link href="/dashboard/meetings" className="text-sm font-medium text-[#6c63ff] hover:text-[#5b52ee]">
                View all →
              </Link>
            </div>

            <div className="p-4">
              {todayMeetings.length > 0 ? (
                <div className="space-y-3">
                  {todayMeetings.map((meeting) => (
                    <div key={meeting.id} className="rounded-xl border border-gray-100 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="inline-flex rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-semibold text-[#2563eb]">
                            Google Meet
                          </span>
                          <p className="mt-3 truncate text-[15px] font-semibold text-gray-900">{meeting.title}</p>
                          <p className="mt-1 text-[13px] text-gray-500">{formatTimeRange(meeting.startTime, meeting.endTime)}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {meeting.meetLink ? (
                          <Button asChild size="sm" className="bg-[#16a34a] hover:bg-[#15803d]">
                            <a href={meeting.meetLink} target="_blank" rel="noreferrer">
                              Join
                            </a>
                          </Button>
                        ) : null}
                        <Button asChild size="sm">
                          <Link href={getMeetingDetailHref(meeting)}>Start Notetaker</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-gray-500">No meetings scheduled for today</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
