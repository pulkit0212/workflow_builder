"use client";

import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { useApiFetch, useIsAuthReady } from "@/hooks/useApiFetch";

export type DashboardProfile = {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
  plan: string;
};

type DashboardAccountProps = {
  initialProfile: DashboardProfile;
  compact?: boolean;
};

type ProfileApiResponse = {
  success: true;
  profile: DashboardProfile;
};

export function DashboardAccount({ initialProfile, compact = false }: DashboardAccountProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const apiFetch = useApiFetch();
  const isAuthReady = useIsAuthReady();

  useEffect(() => {
    if (!isAuthReady) return;
    let isMounted = true;

    async function loadProfile() {
      setIsRefreshing(true);
      try {
        const response = await apiFetch("/api/profile/me", { method: "GET", cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as ProfileApiResponse;
        if (isMounted && data.success) setProfile(data.profile);
      } finally {
        if (isMounted) setIsRefreshing(false);
      }
    }

    void loadProfile();
    return () => { isMounted = false; };
  }, [isAuthReady]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-full border border-[#e5e7eb] bg-white px-2 py-2 shadow-sm",
        compact && "border-transparent p-0 shadow-none"
      )}
    >
      {!compact ? (
        <div className="hidden min-w-0 px-2 sm:block">
          <p className="truncate text-sm font-semibold text-slate-950">{profile.fullName || profile.email}</p>
          <p className="truncate text-xs uppercase tracking-[0.2em] text-slate-500">
            {profile.plan} plan{isRefreshing ? " syncing" : ""}
          </p>
        </div>
      ) : null}
      <UserButton afterSignOutUrl="/" />
    </div>
  );
}
