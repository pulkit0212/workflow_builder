"use client";

import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { DashboardAccount, type DashboardProfile } from "@/components/layout/dashboard-account";
import { DashboardMobileNav } from "@/components/layout/dashboard-mobile-nav";
import { hasClerkPublishableKey } from "@/lib/auth/clerk-env";

const pageTitles: Array<{ match: (pathname: string) => boolean; title: string }> = [
  { match: (pathname) => pathname === "/dashboard", title: "Dashboard" },
  { match: (pathname) => pathname.startsWith("/dashboard/meetings"), title: "Meetings" },
  { match: (pathname) => pathname.startsWith("/dashboard/reports"), title: "Meeting Reports" },
  { match: (pathname) => pathname.startsWith("/dashboard/action-items"), title: "Action Items" },
  { match: (pathname) => pathname.startsWith("/dashboard/history"), title: "History" },
  { match: (pathname) => pathname.startsWith("/dashboard/tools"), title: "Tools" },
  { match: (pathname) => pathname.startsWith("/dashboard/workspace"), title: "Workspaces" },
  { match: (pathname) => pathname.startsWith("/dashboard/settings"), title: "Settings" },
  { match: (pathname) => pathname.startsWith("/dashboard/billing"), title: "Billing" },
  { match: (pathname) => pathname.startsWith("/dashboard/meeting-assistant"), title: "Meeting Assistant" }
];

type DashboardHeaderProps = {
  profile: DashboardProfile;
};

export function DashboardHeader({ profile }: DashboardHeaderProps) {
  const pathname = usePathname();
  const pageTitle = pageTitles.find((item) => item.match(pathname))?.title ?? "Artivaa";

  return (
    <header className="sticky top-0 z-20 border-b border-[#e5e7eb] bg-white">
      <div className="flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[24px] font-bold text-[#111827]">{pageTitle}</p>
        </div>
        <div className="hidden flex-[1.2] justify-center md:flex">
          <label className="flex w-full max-w-xl items-center gap-3 rounded-lg border border-[#d1d5db] bg-[#f9fafb] px-4 py-2">
            <Search className="h-4 w-4 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="Ask Artivaa anything..."
              className="w-full border-0 bg-transparent p-0 text-sm text-[#374151] outline-none placeholder:text-[#9ca3af]"
            />
          </label>
        </div>
        <div className="flex flex-1 items-center justify-end gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] transition-colors hover:bg-[#f9fafb] hover:text-[#111827]"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
          {hasClerkPublishableKey ? (
            <DashboardAccount initialProfile={profile} compact />
          ) : (
            <div className="rounded-full border border-[#e5e7eb] bg-white px-3 py-2 text-xs text-slate-500">
              Auth disabled
            </div>
          )}
        </div>
      </div>
      <DashboardMobileNav />
    </header>
  );
}
