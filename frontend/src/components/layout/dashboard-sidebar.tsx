"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Clock3,
  CreditCard,
  FileText,
  Grid2x2,
  LayoutDashboard,
  Link2,
  Plus,
  Settings,
  Users,
  UsersRound,
  Video,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardProfile } from "@/components/layout/dashboard-account";
import { WorkspaceSwitcher } from "@/components/workspace/WorkspaceSwitcher";

type DashboardNavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  section: "primary" | "secondary";
};

type WorkspaceSubNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

const workspaceSubNav: WorkspaceSubNavItem[] = [
  { href: "", label: "Overview", icon: LayoutDashboard },
  { href: "/meetings", label: "Meetings", icon: Video },
  { href: "/action-items", label: "Action Items", icon: CheckSquare },
  { href: "/members", label: "Members", icon: Users },
  { href: "/requests", label: "Requests", icon: ClipboardList, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

const navigation: DashboardNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Grid2x2, section: "primary" },
  { href: "/dashboard/meetings", label: "Meetings", icon: CalendarDays, section: "primary" },
  { href: "/dashboard/reports", label: "Reports", icon: FileText, section: "primary" },
  { href: "/dashboard/action-items", label: "Action Items", icon: CheckSquare, section: "primary" },
  { href: "/dashboard/integrations", label: "Integrations", icon: Link2, section: "primary" },
  { href: "/dashboard/history", label: "History", icon: Clock3, section: "primary" },
  { href: "/dashboard/workspaces", label: "Workspace", icon: UsersRound, section: "primary" },
  { href: "/dashboard/tools", label: "Tools", icon: Wrench, section: "secondary" },
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

type WorkspaceSubNavState = {
  isAdmin: boolean;
  pendingCount: number;
};

function WorkspaceSubNav({ workspaceId, pathname }: { workspaceId: string; pathname: string }) {
  const [state, setState] = useState<WorkspaceSubNavState>({ isAdmin: false, pendingCount: 0 });

  useEffect(() => {
    let isMounted = true;

    async function loadWorkspaceData() {
      try {
        // Fetch workspace details including current user's role
        const wsRes = await fetch(`/api/workspaces/${workspaceId}`, { cache: "no-store" });
        if (!wsRes.ok) return;

        const wsData = (await wsRes.json()) as { workspace?: { currentUserRole?: string } };
        const role = wsData.workspace?.currentUserRole ?? "";
        const isAdmin = ["admin", "owner"].includes(role);

        if (isAdmin) {
          // Fetch pending requests count
          const reqRes = await fetch(`/api/workspace/${workspaceId}/move-requests`, { cache: "no-store" });
          if (reqRes.ok) {
            const reqData = (await reqRes.json()) as { moveRequests?: unknown[] };
            const pendingCount = reqData.moveRequests?.length ?? 0;
            if (isMounted) setState({ isAdmin: true, pendingCount });
          } else if (isMounted) {
            setState({ isAdmin: true, pendingCount: 0 });
          }
        } else if (isMounted) {
          setState({ isAdmin: false, pendingCount: 0 });
        }
      } catch {
        // silently ignore
      }
    }

    void loadWorkspaceData();

    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

  const baseHref = `/dashboard/workspace/${workspaceId}`;

  return (
    <div className="mt-4">
      <p className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        Workspace
      </p>
      <nav className="space-y-1">
        {workspaceSubNav.map((item) => {
          if (item.adminOnly && !state.isAdmin) return null;

          const href = `${baseHref}${item.href}` as Route;
          const isActive = item.href === ""
            ? pathname === baseHref || pathname === `${baseHref}/`
            : pathname === href || pathname.startsWith(`${href}/`);
          const Icon = item.icon;
          const showBadge = item.label === "Requests" && state.isAdmin && state.pendingCount > 0;

          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-[#e2e8f0] transition-colors hover:bg-white/10",
                isActive && "bg-[#6c63ff] text-white hover:bg-[#6c63ff]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {state.pendingCount > 99 ? "99+" : state.pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="my-4 h-px bg-white/10" />
    </div>
  );
}

export function DashboardSidebar({ profile }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [subscription, setSubscription] = useState<SubscriptionBadgeState>({ plan: profile.plan, trialDaysLeft: 0 });
  const primaryItems = navigation.filter((item) => item.section === "primary");
  const secondaryItems = navigation.filter((item) => item.section === "secondary");

  // Detect workspace context: /dashboard/workspace/[workspaceId]/*
  const workspaceMatch = pathname.match(/^\/dashboard\/workspace\/([^/]+)/);
  const activeWorkspaceId = workspaceMatch?.[1] ?? null;

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

      {activeWorkspaceId && (
        <WorkspaceSubNav workspaceId={activeWorkspaceId} pathname={pathname} />
      )}

      <nav className="space-y-1">
        <p className="mb-2 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Personal
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
