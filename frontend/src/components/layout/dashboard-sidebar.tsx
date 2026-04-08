"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  Clock3,
  CreditCard,
  FileText,
  Grid2x2,
  Link2,
  Settings,
  UsersRound,
  Video,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardProfile } from "@/components/layout/dashboard-account";
import { WorkspaceSwitcher } from "@/components/workspace/WorkspaceSwitcher";
import { useWorkspaceContext } from "@/contexts/workspace-context";

type DashboardNavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  section: "primary" | "secondary";
  personalOnly?: boolean;
};

const navigation: DashboardNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Grid2x2, section: "primary" },
  { href: "/dashboard/meetings", label: "Meetings", icon: CalendarDays, section: "primary" },
  { href: "/dashboard/reports", label: "Reports", icon: FileText, section: "primary" },
  { href: "/dashboard/action-items", label: "Action Items", icon: CheckSquare, section: "primary" },
  { href: "/dashboard/integrations", label: "Integrations", icon: Link2, section: "primary" },
  { href: "/dashboard/history", label: "History", icon: Clock3, section: "primary", personalOnly: true },
  { href: "/dashboard/workspaces", label: "Workspace", icon: UsersRound, section: "primary", personalOnly: true },
  { href: "/dashboard/tools", label: "Tools", icon: Wrench, section: "secondary", personalOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, section: "secondary" },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard, section: "secondary" }
];

function isActiveRoute(pathname: string, href: Route) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

type DashboardSidebarProps = {
  profile: DashboardProfile;
};

type SubscriptionBadgeState = {
  plan: string;
  trialDaysLeft: number;
};

function getInitials(value: string | null, email: string) {
  const source = value?.trim() || email;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export function DashboardSidebar({ profile }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { activeWorkspace, activeWorkspaceId } = useWorkspaceContext();
  const [subscription, setSubscription] = useState<SubscriptionBadgeState>({ plan: profile.plan, trialDaysLeft: 0 });

  // Show personal-only items when workspace type is 'personal' or no workspace is active
  const showPersonalItems = activeWorkspace === null || activeWorkspace.type === "personal";

  const visibleItems = navigation.filter((item) => {
    if (item.personalOnly && !showPersonalItems) return false;
    return true;
  });

  const primaryItems = visibleItems.filter((item) => item.section === "primary");
  const secondaryItems = visibleItems.filter((item) => item.section === "secondary");

  useEffect(() => {
    let isMounted = true;

    async function loadSubscription() {
      try {
        const response = await fetch("/api/subscription", {
          cache: "no-store"
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          success: boolean;
          plan?: string;
          trialDaysLeft?: number;
        };

        if (isMounted && payload.success) {
          setSubscription({
            plan: payload.plan ?? profile.plan,
            trialDaysLeft: payload.trialDaysLeft ?? 0
          });
        }
      } catch {
        return;
      }
    }

    void loadSubscription();

    return () => {
      isMounted = false;
    };
  }, [profile.plan]);

  function getBadgeLabel() {
    switch (subscription.plan) {
      case "trial":
        return `TRIAL — ${subscription.trialDaysLeft} days left`;
      case "pro":
        return "PRO";
      case "elite":
        return "ELITE ✨";
      default:
        return "FREE PLAN";
    }
  }

  function getBadgeClassName() {
    switch (subscription.plan) {
      case "trial":
        return "bg-[#fefce8] text-[#b45309]";
      case "pro":
        return "bg-[#f5f3ff] text-[#6c63ff]";
      case "elite":
        return "bg-gradient-to-r from-[#1f1147] to-[#6c63ff] text-white";
      default:
        return "bg-white/10 text-slate-300";
    }
  }

  return (
    <aside className="hidden w-[240px] flex-col bg-[#1a1a2e] px-4 py-6 text-[#e2e8f0] lg:flex">
      <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#6c63ff] text-base font-bold text-white">A</span>
        <span className="flex flex-col">
          <span className="text-base font-bold text-white">Artivaa</span>
          <span className="text-xs text-slate-400">Meeting Intelligence</span>
        </span>
      </Link>

      <div className="mt-8">
        <WorkspaceSwitcher />
      </div>

      <nav className="mt-4 space-y-1">
        <p className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Navigation
        </p>
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = isActiveRoute(pathname, item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-[#e2e8f0] transition-colors hover:bg-white/10",
                isActive && "bg-[#6c63ff] text-white hover:bg-[#6c63ff]"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {activeWorkspaceId !== null && (
          <Link
            href={"/dashboard/workspace" as Route}
            className={cn(
              "flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-[#e2e8f0] transition-colors hover:bg-white/10",
              (pathname === "/dashboard/workspace" || pathname.startsWith("/dashboard/workspace/")) && "bg-[#6c63ff] text-white hover:bg-[#6c63ff]"
            )}
          >
            <UsersRound className="h-4 w-4" />
            Manage Workspace
          </Link>
        )}
      </nav>

      <nav className="space-y-1">
        {secondaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = isActiveRoute(pathname, item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-[#e2e8f0] transition-colors hover:bg-white/10",
                isActive && "bg-[#6c63ff] text-white hover:bg-[#6c63ff]"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
            {getInitials(profile.fullName, profile.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{profile.fullName || "Artivaa User"}</p>
            <p className="truncate text-xs text-slate-400">{profile.email}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className={cn("rounded-full px-3 py-1 text-[11px] font-semibold", getBadgeClassName())}>{getBadgeLabel()}</span>
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center rounded-lg bg-[#6c63ff] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#5b52ee]"
          >
            Upgrade
          </Link>
        </div>
      </div>
    </aside>
  );
}
