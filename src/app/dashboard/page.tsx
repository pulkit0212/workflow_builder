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
        title={appUser?.fullName ? `Welcome back, ${appUser.fullName.split(" ")[0]}` : "AI productivity workspace"}
        description={
          appUser
            ? `${appUser.email} is synced to your ${appUser.plan} plan workspace and ready for shared AI workflow history.`
            : "A shared SaaS foundation for running and scaling multiple AI workflows without rebuilding auth, billing, or history per feature."
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
            title: "Tool registry",
            value: "4 modules",
            icon: Layers3,
            description: "Centralized definitions for routes, status, metadata, and expansion."
          },
          {
            title: "Execution model",
            value: "ai_runs",
            icon: Zap,
            description: "Shared storage contract for inputs, outputs, models, and token accounting."
          },
          {
            title: "Monetization",
            value: "3 plans",
            icon: BarChart3,
            description: "Billing structure is in place for Free, Pro, and Business growth."
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
        description="Detect upcoming calendar meetings and launch the assistant with the meeting context already filled in."
        emptyTitle="No upcoming Google Meet sessions"
        emptyDescription="You do not have any Google Calendar meetings coming up right now. You can still start the assistant manually for an ad hoc call."
      />

      <section className="space-y-4">
        <SectionHeader
          title="Workflow tools"
          description="Each tool plugs into the same dashboard shell, route shape, and future API contract."
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
