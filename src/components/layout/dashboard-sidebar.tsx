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
      <div className="mt-10 rounded-[2rem] border border-white/70 bg-white/70 p-3 shadow-[0_20px_48px_rgba(15,23,42,0.06)]">
        <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Workspace</p>
        <nav className="space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = isActiveRoute(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-950",
                isActive && "bg-slate-950 text-white shadow-[0_16px_30px_rgba(15,23,42,0.2)] hover:bg-slate-950 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        </nav>
      </div>
      <div className="mt-auto rounded-[2rem] border border-indigo-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(238,242,255,0.96))] p-5 shadow-[0_18px_40px_rgba(99,102,241,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-600">Meeting intelligence</p>
        <p className="mt-3 text-lg font-semibold tracking-tight text-slate-950">One workspace for notes, summaries, and follow-through.</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Capture meetings, generate polished outputs, and keep action items moving without switching contexts.
        </p>
      </div>
    </aside>
  );
}
