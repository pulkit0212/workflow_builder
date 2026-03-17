import type { ReactNode } from "react";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { requireAuth } from "@/lib/auth/clerk";
import { getCurrentAuthenticatedProfile } from "@/lib/auth/profile";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth();
  const profile = await getCurrentAuthenticatedProfile({
    expectedClerkUserId: session.userId ?? undefined,
    sync: true
  });

  if (!profile) {
    throw new Error("Authenticated profile could not be resolved.");
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
      <DashboardSidebar />
      <div className="min-w-0">
        <DashboardHeader
          profile={{
            id: profile.id,
            clerkUserId: profile.clerkUserId,
            email: profile.email,
            fullName: profile.fullName,
            plan: profile.plan
          }}
        />
        <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
