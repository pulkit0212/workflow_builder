"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CreditCard, LayoutDashboard, Settings, Sparkles, History, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/layout/logo-mark";

type DashboardNavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
};

const navigation: DashboardNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/meetings", label: "Meetings", icon: CalendarDays },
  { href: "/dashboard/tools", label: "Tools", icon: Sparkles },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings }
];

function isActiveRoute(pathname: string, href: Route) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="glass-panel hidden w-80 flex-col border-r border-white/70 px-6 py-8 lg:flex">
      <LogoMark />
      <nav className="mt-10 space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = isActiveRoute(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950",
                isActive && "bg-slate-950 text-white hover:bg-slate-950 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 to-orange-50 p-5">
        <p className="text-sm font-semibold text-slate-950">Phase 1 foundation</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Tool registry, run history model, and reusable shells are ready for Phase 2 execution wiring.
        </p>
      </div>
    </aside>
  );
}
