// ─── Design tokens ────────────────────────────────────────────────────────
// Primary: #6C3FF5 (purple) — used everywhere
// Active bg: #EDE9FE
// Active text: #6C3FF5
// Active border: #6C3FF5
"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { DashboardProfile } from "@/components/layout/dashboard-account";
import { WorkspaceSwitcher } from "@/components/workspace/WorkspaceSwitcher";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";

// ─── Nav items ────────────────────────────────────────────────────────────────

type NavItem = {
  href: Route;
  label: string;
  icon: string; // Material Symbol name
  personalOnly?: boolean;
};

const primaryNav: NavItem[] = [
  { href: "/dashboard",              label: "Dashboard",    icon: "dashboard" },
  { href: "/dashboard/meetings",     label: "Meetings",     icon: "videocam" },
  { href: "/dashboard/reports",      label: "Reports",      icon: "bar_chart" },
  { href: "/dashboard/action-items", label: "Action Items", icon: "assignment" },
  { href: "/dashboard/history",      label: "History",      icon: "history",      personalOnly: true },
  { href: "/dashboard/integrations", label: "Integrations", icon: "extension" },
  { href: "/dashboard/tools",        label: "Tools",        icon: "build",        personalOnly: true },
];

const secondaryNav: NavItem[] = [
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  { href: "/dashboard/billing",  label: "Billing",  icon: "credit_card" },
];

function isActive(pathname: string, href: Route) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getInitials(name: string | null, email: string) {
  const src = name?.trim() || email;
  return src.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

// ─── Nav link ─────────────────────────────────────────────────────────────────

function NavLink({ href, label, icon, active }: { href: Route; label: string; icon: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-150 cursor-pointer",
        "border-l-[3px] rounded-r-sm",
        active
          ? "bg-[#EDE9FE] text-[#6C3FF5] border-[#6C3FF5] font-semibold"
          : "text-[#5F6368] border-transparent hover:bg-[#F1F3F4] hover:text-[#202124]"
      )}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type DashboardSidebarProps = {
  profile: DashboardProfile;
};

export function DashboardSidebar({ profile }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { activeWorkspace, activeWorkspaceId, canUseTeamWorkspace } = useWorkspaceContext();
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();
  const [plan, setPlan] = useState(profile.plan);

  const showPersonalItems = activeWorkspace === null || activeWorkspace.type === "personal";

  const visiblePrimary = primaryNav.filter((item) => !item.personalOnly || showPersonalItems);

  useEffect(() => {
    if (!isAuthReady) return;
    let mounted = true;
    void (async () => {
      try {
        const res = await apiFetch("/api/subscription", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as { success: boolean; plan?: string };
        if (mounted && data.success && data.plan) setPlan(data.plan);
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [isAuthReady]);

  return (
    <aside
      className="w-full h-full flex flex-col bg-white border-r border-[#DADCE0] overflow-y-auto"
    >
      {/* ── Logo / Workspace switcher ── */}
      <div className="px-4 pt-4 pb-2">
        <WorkspaceSwitcher />
      </div>

      {/* ── Primary nav ── */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-2 py-2 space-y-0.5">
        {visiblePrimary.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(pathname, item.href)}
          />
        ))}

        {/* Workspace management link (only when workspace active) */}
        {activeWorkspaceId !== null && (
          <NavLink
            href={"/dashboard/workspace" as Route}
            label="Manage Workspace"
            icon="manage_accounts"
            active={isActive(pathname, "/dashboard/workspace" as Route)}
          />
        )}

        {/* Workspace section label */}
        {activeWorkspaceId !== null && (
          <div className="pt-4 pb-1 px-3">
            <p className="text-[10px] font-bold text-[#9AA0A6] uppercase tracking-widest">Workspace</p>
          </div>
        )}
      </nav>

      {/* ── Secondary nav + user ── */}
      <div className="border-t border-[#DADCE0] px-2 py-2 space-y-0.5">
        {secondaryNav.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={isActive(pathname, item.href)}
          />
        ))}

        {/* Create workspace — Elite only */}
        <div className="px-2 pt-2 pb-1">
          {canUseTeamWorkspace ? (
            <Link
              href={"/dashboard/workspace" as Route}
              className="w-full flex items-center justify-center gap-2 bg-[#6C3FF5] text-white py-2 rounded-lg text-sm font-semibold shadow-sm hover:bg-[#5B2FE0] transition-colors active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Create Workspace</span>
            </Link>
          ) : (
            <Link
              href={"/dashboard/billing" as Route}
              className="w-full flex items-center justify-center gap-2 border border-[#DADCE0] bg-white text-[#5F6368] py-2 rounded-lg text-sm font-semibold hover:bg-[#F8F9FA] transition-colors"
            >
              <span className="material-symbols-outlined text-[18px] text-[#7C3AED]">workspace_premium</span>
              <span>Elite: Team workspace</span>
            </Link>
          )}
        </div>

        {/* User info */}
        <div className="px-3 py-3 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-sm font-bold text-[#6C3FF5]">
            {getInitials(profile.fullName, profile.email)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#202124]">{profile.fullName || "User"}</p>
            <p className="truncate text-xs text-[#5F6368]">{profile.email}</p>
          </div>
          <span className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            plan === "pro" ? "bg-[#EDE9FE] text-[#6C3FF5]" :
            plan === "elite" ? "bg-[#F3E8FF] text-[#7C3AED]" :
            plan === "trial" ? "bg-[#E8F0FE] text-[#1967D2]" :
            "bg-[#F1F3F4] text-[#5F6368]"
          )}>
            {plan === "pro" ? "Pro" : plan === "elite" ? "Elite" : plan === "trial" ? "Trial" : "Free"}
          </span>
        </div>

        {/* Sign out */}
        <Link
          href="/sign-out"
          className="flex items-center gap-3 px-3 py-2 text-sm text-[#EA4335] hover:bg-[#FCE8E6] rounded-sm transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          <span>Sign Out</span>
        </Link>
      </div>
    </aside>
  );
}
