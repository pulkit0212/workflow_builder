"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, History, LayoutDashboard, Settings, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type DashboardNavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
};

const navigation: DashboardNavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/tools", label: "Tools", icon: Sparkles },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings }
];

export function DashboardMobileNav() {
  const pathname = usePathname();

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:hidden">
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-sm font-medium text-slate-600",
              isActive && "border-slate-950 bg-slate-950 text-white"
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
