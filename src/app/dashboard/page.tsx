import Link from "next/link";
import { ArrowRight, BarChart3, Layers3, Zap } from "lucide-react";
import { SectionHeader } from "@/components/shared/section-header";
import { ToolCard } from "@/components/tools/tool-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DashboardNextMeetingBanner } from "@/features/upcoming-meetings/components/dashboard-next-meeting-banner";
import { UpcomingMeetingsPanel } from "@/features/upcoming-meetings/components/upcoming-meetings-panel";
import { getUpcomingGoogleCalendarMeetingsForUser } from "@/features/upcoming-meetings/server";
import { allTools } from "@/lib/ai/tool-registry";
import { getCurrentAuthenticatedProfile } from "@/lib/auth/profile";

export default async function DashboardPage() {
  const appUser = await getCurrentAuthenticatedProfile({ sync: true });
  const upcomingMeetings =
    appUser?.source === "database"
      ? await getUpcomingGoogleCalendarMeetingsForUser(appUser.id).catch(() => [])
      : [];

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Overview"
        title={appUser?.fullName ? `Welcome back, ${appUser.fullName.split(" ")[0]}` : "Artiva workspace"}
        description={
          appUser
            ? `${appUser.email} is synced to your ${appUser.plan} plan workspace and ready for transcripts, summaries, and follow-through.`
            : "A unified workspace for meeting capture, transcript review, and action-ready summaries."
        }
        action={
          <Button asChild>
            <Link href="/dashboard/tools">
              Browse tools
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <DashboardNextMeetingBanner meetings={upcomingMeetings} />

      <div className="grid gap-5 md:grid-cols-3">
        {[
          {
            title: "Meeting coverage",
            value: "Today-first",
            icon: Layers3,
            description: "See what's next, what's joined, and what needs attention without leaving the dashboard."
          },
          {
            title: "Structured output",
            value: "Transcript + summary",
            icon: Zap,
            description: "Summaries, key points, and action items stay organized in the same product language."
          },
          {
            title: "Workspace polish",
            value: "Unified light theme",
            icon: BarChart3,
            description: "Landing, shell, and meeting pages now share one consistent premium SaaS feel."
          }
        ].map((item) => (
          <Card key={item.title} className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{item.title}</p>
                <item.icon className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <p className="text-3xl font-semibold text-slate-950">{item.value}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <UpcomingMeetingsPanel
        meetings={upcomingMeetings}
        title="Upcoming Google Meet sessions"
        description="See the next meetings on your calendar and launch the assistant with context already in place."
        emptyTitle="No upcoming Google Meet sessions"
        emptyDescription="You do not have any Google Calendar meetings coming up right now. You can still start the assistant manually for an ad hoc call."
      />

      <section className="space-y-4">
        <SectionHeader
          title="Workflow tools"
          description="Each tool lives inside the same bright workspace so the product feels consistent from first click to final summary."
        />
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {allTools.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      </section>
    </div>
  );
}
