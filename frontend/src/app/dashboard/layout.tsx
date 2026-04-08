import type { ReactNode } from "react";
import { Suspense } from "react";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { requireAuth } from "@/lib/auth/clerk";
import { getCurrentAuthenticatedProfile } from "@/lib/auth/profile";
import { WorkspaceProvider } from "@/contexts/workspace-context";

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
    <Suspense>
      <WorkspaceProvider>
        <div className="min-h-screen bg-[#f3f4f6] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
          <DashboardSidebar
            profile={{
              id: profile.id,
              clerkUserId: profile.clerkUserId,
              email: profile.email,
              fullName: profile.fullName,
              plan: profile.plan
            }}
          />
          <div className="min-w-0 bg-[#f3f4f6]">
            <DashboardHeader
              profile={{
                id: profile.id,
                clerkUserId: profile.clerkUserId,
                email: profile.email,
                fullName: profile.fullName,
                plan: profile.plan
              }}
            />
            <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
          </div>
        </div>
      </WorkspaceProvider>
    </Suspense>
  );
}
