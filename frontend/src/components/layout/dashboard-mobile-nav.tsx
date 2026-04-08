"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CheckSquare, Clock3, FileText, Grid2x2, UsersRound, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type DashboardNavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
};

const navigation: DashboardNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Grid2x2 },
  { href: "/dashboard/meetings", label: "Meetings", icon: CalendarDays },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/action-items", label: "Action Items", icon: CheckSquare },
  { href: "/dashboard/history", label: "History", icon: Clock3 },
  { href: "/dashboard/tools", label: "Tools", icon: Wrench },
  { href: "/dashboard/workspaces", label: "Workspaces", icon: UsersRound }
];

function isActiveRoute(pathname: string, href: Route) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardMobileNav() {
  const pathname = usePathname();

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-[#e5e7eb] bg-white px-4 py-3 sm:px-6 lg:hidden">
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = isActiveRoute(pathname, item.href);

        return (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#6b7280] transition-colors hover:bg-[#f9fafb] hover:text-[#111827]",
              isActive && "border-transparent bg-[#6c63ff] text-white"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
