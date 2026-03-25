"use client";

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
  Settings,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardProfile } from "@/components/layout/dashboard-account";

type DashboardNavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  section: "primary" | "secondary";
};

const navigation: DashboardNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Grid2x2, section: "primary" },
  { href: "/dashboard/meetings", label: "Meetings", icon: CalendarDays, section: "primary" },
  { href: "/dashboard/reports", label: "Reports", icon: FileText, section: "primary" },
  { href: "/dashboard/action-items", label: "Action Items", icon: CheckSquare, section: "primary" },
  { href: "/dashboard/history", label: "History", icon: Clock3, section: "primary" },
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
  const primaryItems = navigation.filter((item) => item.section === "primary");
  const secondaryItems = navigation.filter((item) => item.section === "secondary");

  return (
    <aside className="hidden w-[240px] flex-col bg-[#1a1a2e] px-4 py-6 text-[#e2e8f0] lg:flex">
      <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#6c63ff] text-base font-bold text-white">A</span>
        <span className="flex flex-col">
          <span className="text-base font-bold text-white">Artiva</span>
          <span className="text-xs text-slate-400">Meeting Intelligence</span>
        </span>
      </Link>

      <nav className="mt-8 space-y-1">
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

      <div className="my-4 h-px bg-white/10" />

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
            <p className="truncate text-sm font-semibold text-white">{profile.fullName || "Artiva User"}</p>
            <p className="truncate text-xs text-slate-400">{profile.email}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-300">FREE PLAN</span>
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
