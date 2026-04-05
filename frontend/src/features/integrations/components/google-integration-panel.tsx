"use client";

import Link from "next/link";
import { Calendar, CheckCircle2, ExternalLink, Link2, LoaderCircle } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionHeader } from "@/components/shared/section-header";
import { ResultState } from "@/components/tools/result-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useGoogleIntegration } from "@/features/integrations/hooks/use-google-integration";

function formatMeetingTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function IntegrationSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-40 rounded-full bg-slate-100" />
          <div className="h-8 w-72 rounded-full bg-slate-200" />
          <div className="h-16 rounded-[1.6rem] bg-slate-100" />
        </div>
      </Card>
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 rounded-full bg-slate-100" />
          <div className="h-24 rounded-[1.6rem] bg-slate-100" />
          <div className="h-24 rounded-[1.6rem] bg-slate-100" />
        </div>
      </Card>
    </div>
  );
}

export function GoogleIntegrationPanel() {
  const { status, meetings, isLoading, isPending, error, actionError, connect, disconnect } =
    useGoogleIntegration();

  if (isLoading) {
    return <IntegrationSkeleton />;
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Integrations"
        title="Connected apps"
        description="Connect Google to pull upcoming meetings from Calendar and prepare Artivaa for automatic meeting intake."
      />

      {error ? <ResultState icon="error" title="Unable to load integrations" description={error} /> : null}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-r from-sky-50 via-white to-orange-50 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Google</p>
              <h2 className="text-xl font-semibold text-slate-950">Google Calendar integration</h2>
              <p className="text-sm text-slate-600">Connect your Google account to surface upcoming meetings and join links.</p>
            </div>
            <Badge variant={status?.connected ? "available" : "neutral"}>
              {status?.connected ? "Connected" : "Not connected"}
            </Badge>
          </div>
        </div>
        <div className="space-y-5 p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Provider</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">Google</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Calendar Access</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">Upcoming events</p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Use Case</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">Artivaa intake</p>
            </div>
          </div>

          {actionError ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {actionError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {!status?.connected ? (
              <Button type="button" onClick={connect}>
                <Link2 className="h-4 w-4" />
                Connect Google
              </Button>
            ) : (
              <>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Connected
                </div>
                <Button type="button" variant="secondary" onClick={disconnect} disabled={isPending}>
                  {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                  Disconnect
                </Button>
              </>
            )}
            <Button asChild variant="ghost">
              <Link href="/dashboard/meetings">Open meetings</Link>
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Upcoming meetings</h2>
              <p className="mt-1 text-sm text-slate-600">Upcoming events pulled from the connected Google Calendar account.</p>
            </div>
            <Badge variant="pending">Calendar</Badge>
          </div>

          {!status?.connected ? (
            <EmptyState
              icon={Calendar}
              title="Connect Google to view meetings"
              description="Once your Google account is connected, upcoming calendar events and Meet links will appear here."
            />
          ) : meetings.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No upcoming meetings"
              description="There are no upcoming Google Calendar events available for this account right now."
            />
          ) : (
            <div className="space-y-4">
              {meetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="rounded-[1.8rem] border border-slate-200 bg-slate-50/80 p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <p className="text-lg font-semibold text-slate-950">{meeting.title}</p>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Calendar className="h-4 w-4 text-sky-600" />
                        {formatMeetingTime(meeting.startTime)}
                      </div>
                    </div>
                    {meeting.meetLink ? (
                      <a
                        href={meeting.meetLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-sky-200 hover:text-slate-950"
                      >
                        Join link
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : (
                      <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500">
                        No Meet link
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
