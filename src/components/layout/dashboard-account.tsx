"use client";

import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";

export type DashboardProfile = {
  id: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
  plan: string;
};

type DashboardAccountProps = {
  initialProfile: DashboardProfile;
};

type ProfileApiResponse = {
  success: true;
  profile: DashboardProfile;
};

export function DashboardAccount({ initialProfile }: DashboardAccountProps) {
  const [profile, setProfile] = useState(initialProfile);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      setIsRefreshing(true);

      try {
        const response = await fetch("/api/profile/me", {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as ProfileApiResponse;

        if (isMounted && data.success) {
          setProfile(data.profile);
        }
      } finally {
        if (isMounted) {
          setIsRefreshing(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex items-center gap-3 rounded-full border border-white/70 bg-white/80 px-2 py-2 shadow-sm">
      <div className="hidden min-w-0 px-2 sm:block">
        <p className="truncate text-sm font-semibold text-slate-950">{profile.fullName || profile.email}</p>
        <p className="truncate text-xs uppercase tracking-[0.2em] text-slate-500">
          {profile.plan} plan{isRefreshing ? " syncing" : ""}
        </p>
      </div>
      <UserButton afterSignOutUrl="/" />
    </div>
  );
}
