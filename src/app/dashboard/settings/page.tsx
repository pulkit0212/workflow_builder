import { getCurrentAuthenticatedProfile } from "@/lib/auth/profile";
import { SectionHeader } from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";

const sections = [
  {
    title: "Profile",
    description: "Prepare profile data, workspace identity, and account ownership settings."
  },
  {
    title: "Preferences",
    description: "Reserve space for default output style, notification choices, and product defaults."
  },
  {
    title: "Usage",
    description: "Connect plan limits, consumed credits, and tool-level quotas in a later phase."
  }
] as const;

export default async function SettingsPage() {
  const appUser = await getCurrentAuthenticatedProfile({ sync: true });

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Settings"
        title="Workspace configuration"
        description="Placeholder settings sections that can later connect to Clerk profile data, billing entitlements, and AI usage controls."
      />
      <div className="grid gap-6">
        <Card className="p-6">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-slate-950">Current profile</h3>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Synced from Clerk and available through <code>/api/profile/me</code>.
            </p>
            <div className="grid gap-3 pt-2 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Name</p>
                <p className="mt-2 text-sm font-medium text-slate-950">{appUser?.fullName || "Not set"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Email</p>
                <p className="mt-2 text-sm font-medium text-slate-950">{appUser?.email || "Unavailable"}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Plan</p>
                <p className="mt-2 text-sm font-medium capitalize text-slate-950">{appUser?.plan || "free"}</p>
              </div>
            </div>
          </div>
        </Card>
        {sections.map((section) => (
          <Card key={section.title} className="p-6">
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-slate-950">{section.title}</h3>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">{section.description}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
