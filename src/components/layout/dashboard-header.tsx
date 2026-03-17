import type { Route } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { DashboardAccount, type DashboardProfile } from "@/components/layout/dashboard-account";
import { DashboardMobileNav } from "@/components/layout/dashboard-mobile-nav";
import { hasClerkPublishableKey } from "@/lib/auth/clerk-env";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/layout/logo-mark";

const meetingSummarizerRoute = "/dashboard/tools/meeting-summarizer" as Route;

type DashboardHeaderProps = {
  profile: DashboardProfile;
};

export function DashboardHeader({ profile }: DashboardHeaderProps) {
  return (
    <header className="glass-panel sticky top-0 z-20 border-b border-white/70">
      <div className="flex h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 lg:hidden">
          <LogoMark />
        </div>
        <div className="hidden items-center gap-3 lg:flex">
          <div className="rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm text-slate-600">
            Shared workflow foundation for all AI tools
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="secondary" size="sm">
            <Link href={meetingSummarizerRoute}>
              <Sparkles className="h-4 w-4" />
              New Run
            </Link>
          </Button>
          {hasClerkPublishableKey ? (
            <DashboardAccount initialProfile={profile} />
          ) : (
            <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-500">
              Auth disabled
            </div>
          )}
        </div>
      </div>
      <DashboardMobileNav />
    </header>
  );
}
