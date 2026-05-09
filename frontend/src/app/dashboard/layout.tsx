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

  const profileData = {
    id: profile.id,
    clerkUserId: profile.clerkUserId,
    email: profile.email,
    fullName: profile.fullName,
    plan: profile.plan
  };

  return (
    <Suspense>
      <WorkspaceProvider>
        <div className="min-h-screen bg-[#F8F9FA]">
          {/* Fixed sidebar */}
          <div className="hidden lg:block fixed left-0 top-0 h-screen w-[240px] z-40">
            <DashboardSidebar profile={profileData} />
          </div>

          {/* Main content — offset by sidebar width */}
          <div className="lg:ml-[240px] flex flex-col min-h-screen">
            <DashboardHeader profile={profileData} />
            <main className="flex-1 p-3 lg:p-5">
              {children}
            </main>
          </div>
        </div>
      </WorkspaceProvider>
    </Suspense>
  );
}
